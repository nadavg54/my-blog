import { getSupabaseClient, getSQLClient, isUsingLocalPostgres } from '../../lib/db';

// Podcast domain mappings
export const PODCAST_DOMAINS: Record<string, string> = {
  'data-engineering-podcast': 'dataengineeringpodcast.com',
  'software-engineering-radio': 'se-radio.net',
  'software-engineering-daily': 'softwareengineeringdaily',
  'changelog': 'changelog.com',
};

// Podcast display names
export const PODCAST_NAMES: Record<string, string> = {
  'data-engineering-podcast': 'Data Engineering Podcast',
  'software-engineering-radio': 'Software Engineering Radio',
  'software-engineering-daily': 'Software Engineering Daily',
  'changelog': 'Changelog',
};


export async function GET(request: Request) {
  const urlObj = new URL(request.url);
  const params = extractQueryParams(urlObj);

  // Safety check: if no query, return empty results
  if (isEmptyQuery(params)) {
    return createSuccessResponse([]);
  }

  const useLocal = isUsingLocalPostgres();
  const clientType = useLocal ? 'Local PostgreSQL' : 'Supabase';
  console.log(`[podcasts.ts] Using database client: ${clientType}`);

  if (useLocal) {
    return await executeLocalPostgresQuery(params);
  } else {
    return await executeSupabaseQuery(params);
  }
}

// Query parameters interface
interface QueryParams {
  orGroups: string[];
  excludes: string[];
  titleFilter: string | null;
  selectedPodcasts: string[];
}

// Extract query parameters from request URL
function extractQueryParams(url: URL): QueryParams {
  return {
    orGroups: url.searchParams.getAll('orGroup'),
    excludes: url.searchParams.getAll('exclude'),
    titleFilter: url.searchParams.get('title'),
    selectedPodcasts: url.searchParams.getAll('podcast'),
  };
}

// Check if query is empty (no filters applied)
function isEmptyQuery(params: QueryParams): boolean {
  return (
    params.orGroups.length === 0 &&
    params.excludes.length === 0 &&
    !params.titleFilter &&
    params.selectedPodcasts.length === 0
  );
}

// Get podcast domains to filter based on selected podcasts
function getPodcastDomainsToFilter(selectedPodcasts: string[]): string[] {
  const podcastsToFilter =
    selectedPodcasts.length > 0 ? selectedPodcasts : Object.keys(PODCAST_DOMAINS);

  return podcastsToFilter
    .map(podcastKey => PODCAST_DOMAINS[podcastKey])
    .filter((domain): domain is string => !!domain);
}

// Build SQL query with podcast filter (OR between domains)
function buildPodcastFilterSQL(
  sql: ReturnType<typeof getSQLClient>,
  podcastDomains: string[]
): any {
  if (podcastDomains.length === 0) {
    return null;
  }

  if (podcastDomains.length === 1) {
    return sql`SELECT title, url FROM article WHERE url ILIKE ${`%${podcastDomains[0]}%`}`;
  }

  let podcastQuery = sql`url ILIKE ${`%${podcastDomains[0]}%`}`;
  for (let i = 1; i < podcastDomains.length; i++) {
    podcastQuery = sql`${podcastQuery} OR url ILIKE ${`%${podcastDomains[i]}%`}`;
  }
  return sql`SELECT title, url FROM article WHERE (${podcastQuery})`;
}

// Build SQL query with text search filter (OR groups with AND within groups)
function buildTextSearchFilterSQL(
  sql: ReturnType<typeof getSQLClient>,
  orGroups: string[],
  existingQuery: any
): any {
  if (orGroups.length === 0) {
    return existingQuery;
  }

  const textGroups: any[] = [];
  orGroups.forEach(groupStr => {
    const andWords = groupStr.split('|');
    if (andWords.length === 1) {
      textGroups.push(sql`text ILIKE ${`%${andWords[0]}%`}`);
    } else {
      let andQuery = sql`text ILIKE ${`%${andWords[0]}%`}`;
      for (let i = 1; i < andWords.length; i++) {
        andQuery = sql`${andQuery} AND text ILIKE ${`%${andWords[i]}%`}`;
      }
      textGroups.push(sql`(${andQuery})`);
    }
  });

  const textCondition =
    textGroups.length === 1
      ? textGroups[0]
      : (() => {
          let textQuery = textGroups[0];
          for (let i = 1; i < textGroups.length; i++) {
            textQuery = sql`${textQuery} OR ${textGroups[i]}`;
          }
          return sql`(${textQuery})`;
        })();

  if (existingQuery) {
    return sql`${existingQuery} AND ${textCondition}`;
  }
  return sql`SELECT title, url FROM article WHERE ${textCondition}`;
}

// Build SQL query with exclusion filters
function buildExclusionFilterSQL(
  sql: ReturnType<typeof getSQLClient>,
  excludes: string[],
  existingQuery: any
): any {
  if (excludes.length === 0) {
    return existingQuery;
  }

  let query = existingQuery;
  for (const word of excludes) {
    if (query) {
      query = sql`${query} AND text NOT ILIKE ${`%${word}%`}`;
    } else {
      query = sql`SELECT title, url FROM article WHERE text NOT ILIKE ${`%${word}%`}`;
    }
  }
  return query;
}

// Build SQL query with title filter
function buildTitleFilterSQL(
  sql: ReturnType<typeof getSQLClient>,
  titleFilter: string | null,
  existingQuery: any
): any {
  if (!titleFilter) {
    return existingQuery;
  }

  if (existingQuery) {
    return sql`${existingQuery} AND title ILIKE ${`%${titleFilter}%`}`;
  }
  return sql`SELECT title, url FROM article WHERE title ILIKE ${`%${titleFilter}%`}`;
}

// Build complete SQL query with all filters
async function executeLocalPostgresQuery(params: QueryParams): Promise<Response> {
  const sql = getSQLClient();

  try {
    const podcastDomains = getPodcastDomainsToFilter(params.selectedPodcasts);

    // Build query incrementally
    let query = buildPodcastFilterSQL(sql, podcastDomains);
    query = buildTextSearchFilterSQL(sql, params.orGroups, query);
    query = buildExclusionFilterSQL(sql, params.excludes, query);
    query = buildTitleFilterSQL(sql, params.titleFilter, query);

    // If no conditions, select all
    if (!query) {
      query = sql`SELECT title, url FROM article`;
    }

    const data = await query;

    return createSuccessResponse(data || []);
  } catch (error: any) {
    return createErrorResponse(error.message);
  }
}

// Build Supabase podcast filters
function buildSupabasePodcastFilters(selectedPodcasts: string[]): string[] {
  const podcastsToFilter =
    selectedPodcasts.length > 0 ? selectedPodcasts : Object.keys(PODCAST_DOMAINS);

  return podcastsToFilter
    .map(podcastKey => {
      const domain = PODCAST_DOMAINS[podcastKey];
      return domain ? `url.ilike.*${domain}*` : null;
    })
    .filter((f): f is string => f !== null);
}

// Build Supabase text search filter
function buildSupabaseTextSearchFilter(orGroups: string[]): string | null {
  if (orGroups.length === 0) {
    return null;
  }

  const orFilterSegments = orGroups.map(groupStr => {
    const andWords = groupStr.split('|');
    const andSegment = andWords.map(word => `text.ilike.*${word}*`).join(',');
    return `and(${andSegment})`;
  });
  return orFilterSegments.join(',');
}

// Build complete Supabase query with all filters
async function executeSupabaseQuery(params: QueryParams): Promise<Response> {
  const supabase = getSupabaseClient();
  let query = supabase.from('article').select('title, url');

  const podcastFilters = buildSupabasePodcastFilters(params.selectedPodcasts);
  const textSearchFilter = buildSupabaseTextSearchFilter(params.orGroups);

  // Apply podcast filter
  if (podcastFilters.length > 0) {
    query = query.or(podcastFilters.join(','));
  }

  // Apply text search filter (combine with podcast filter if both exist)
  if (textSearchFilter) {
    if (podcastFilters.length > 0) {
      const combined = `and(or(${podcastFilters.join(',')}),or(${textSearchFilter}))`;
      query = supabase.from('article').select('title, url').or(combined);
    } else {
      query = query.or(textSearchFilter);
    }
  }

  // Process exclusions
  if (params.excludes.length > 0) {
    params.excludes.forEach(word => {
      query = query.not('text', 'ilike', `%${word}%`);
    });
  }

  // Apply title filter
  if (params.titleFilter) {
    query = query.ilike('title', `%${params.titleFilter}%`);
  }

  const { data, error } = await query;

  if (error) {
    return createErrorResponse(error.message);
  }

  return createSuccessResponse(data);
}

// Create success response
function createSuccessResponse(data: any[]): Response {
  return new Response(JSON.stringify({ ok: true, results: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Create error response
function createErrorResponse(errorMessage: string): Response {
  return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}



