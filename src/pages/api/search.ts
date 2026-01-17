import { getSupabaseClient, getSQLClient, isUsingLocalPostgres } from '../../lib/db';

// Company domain mappings
export const COMPANY_DOMAINS: Record<string, string[]> = {
  'amazon': ['amazon.com', 'aws.amazon.com'],
  'cloudflare': ['cloudflare.com', 'blog.cloudflare.com'],
  'cncf': ['cncf.io'],
  'confluent': ['confluent.io', 'confluent.com'],
  'datadoghq': ['datadoghq.com'],
  'doordash': ['doordash.com', 'doordash.engineering'],
  'dropbox': ['dropbox.com', 'dropbox.tech'],
  'fb': ['fb.com', 'facebook.com', 'engineering.fb.com'],
  'figma': ['figma.com'],
  'github': ['github.com', 'github.blog'],
  'google': ['google.com', 'googleblog.com', 'developers.googleblog.com'],
  'netflix': ['netflix.com', 'netflixtechblog.com'],
  'slack': ['slack.com'],
  'uber': ['uber.com'],
  'twitter': ['blog.x.com']
};

// Get company domains to filter based on selected companies
function getCompanyDomainsToFilter(selectedCompanies: string[]): string[] {
  if (selectedCompanies.length === 0) {
    return [];
  }

  const domains: string[] = [];
  selectedCompanies.forEach(companyKey => {
    const companyDomains = COMPANY_DOMAINS[companyKey];
    if (companyDomains) {
      domains.push(...companyDomains);
    }
  });
  return domains;
}

export async function GET(request: Request) {
  const urlObj = new URL(request.url);
  
  // Get all instances of our complex logic parameters
  const orGroups = urlObj.searchParams.getAll('orGroup'); 
  const excludes = urlObj.searchParams.getAll('exclude');
  const titleFilter = urlObj.searchParams.get('title');
  const urlFilter = urlObj.searchParams.get('url');
  const companies = urlObj.searchParams.getAll('company');

  // Safety check: if no query, return empty results
  if (orGroups.length === 0 && excludes.length === 0 && !titleFilter && !urlFilter && companies.length === 0) {
    return new Response(JSON.stringify({ ok: true, results: [] }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const useLocal = isUsingLocalPostgres();

  if (useLocal) {
    // Build SQL query directly
    const sql = getSQLClient();

    try {
      // Build query using template tags incrementally
      let query: any = null;

      // 1. Process OR Groups (Nested AND logic)
      if (orGroups.length > 0) {
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

        if (textGroups.length === 1) {
          query = sql`SELECT title, url FROM article WHERE ${textGroups[0]}`;
        } else {
          let textQuery = textGroups[0];
          for (let i = 1; i < textGroups.length; i++) {
            textQuery = sql`${textQuery} OR ${textGroups[i]}`;
          }
          query = sql`SELECT title, url FROM article WHERE (${textQuery})`;
        }
      }

      // 2. Process Universal Exclusions
      if (excludes.length > 0) {
        for (const word of excludes) {
          if (query) {
            query = sql`${query} AND text NOT ILIKE ${`%${word}%`}`;
          } else {
            query = sql`SELECT title, url FROM article WHERE text NOT ILIKE ${`%${word}%`}`;
          }
        }
      }

      // 3. Apply Title Filter (AND condition)
      if (titleFilter) {
        if (query) {
          query = sql`${query} AND title ILIKE ${`%${titleFilter}%`}`;
        } else {
          query = sql`SELECT title, url FROM article WHERE title ILIKE ${`%${titleFilter}%`}`;
        }
      }

      // 4. Apply URL Filter (AND condition)
      if (urlFilter) {
        if (query) {
          query = sql`${query} AND url ILIKE ${`%${urlFilter}%`}`;
        } else {
          query = sql`SELECT title, url FROM article WHERE url ILIKE ${`%${urlFilter}%`}`;
        }
      }

      // 5. Apply Company Filters (OR condition - URL contains any selected company domain)
      const companyDomains = getCompanyDomainsToFilter(companies);
      if (companyDomains.length > 0) {
        if (companyDomains.length === 1) {
          const companyCondition = sql`url ILIKE ${`%${companyDomains[0]}%`}`;
          if (query) {
            query = sql`${query} AND ${companyCondition}`;
          } else {
            query = sql`SELECT title, url FROM article WHERE ${companyCondition}`;
          }
        } else {
          let companyQuery = sql`url ILIKE ${`%${companyDomains[0]}%`}`;
          for (let i = 1; i < companyDomains.length; i++) {
            companyQuery = sql`${companyQuery} OR url ILIKE ${`%${companyDomains[i]}%`}`;
          }
          if (query) {
            query = sql`${query} AND (${companyQuery})`;
          } else {
            query = sql`SELECT title, url FROM article WHERE (${companyQuery})`;
          }
        }
      }

      // If no conditions, select all
      if (!query) {
        query = sql`SELECT title, url FROM article`;
      }

      const data = await query;

      return new Response(
        JSON.stringify({ ok: true, results: data || [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // Use Supabase (original logic)
    const supabase = getSupabaseClient();
    let query = supabase.from('article').select('title, url');

    // 1. Process OR Groups (Nested AND logic)
    if (orGroups.length > 0) {
      const orFilterSegments = orGroups.map(groupStr => {
        const andWords = groupStr.split('|');
        // Create 'and' logic for terms within the same chip group
        const andSegment = andWords.map(word => `text.ilike.*${word}*`).join(',');
        return `and(${andSegment})`;
      });
      // Top-level OR joins different groups
      query = query.or(orFilterSegments.join(','));
    }

    // 2. Process Universal Exclusions
    if (excludes.length > 0) {
      excludes.forEach(word => {
        // Chaining .not in PostgREST acts as "AND NOT"
        query = query.not('text', 'ilike', `%${word}%`);
      });
    }

    // 3. Apply Title Filter (AND condition)
    if (titleFilter) {
      query = query.ilike('title', `%${titleFilter}%`);
    }

    // 4. Apply URL Filter (AND condition)
    if (urlFilter) {
      query = query.ilike('url', `%${urlFilter}%`);
    }

    // 5. Apply Company Filters (OR condition - URL contains any selected company domain)
    const companyDomains = getCompanyDomainsToFilter(companies);
    if (companyDomains.length > 0) {
      const companyFilters = companyDomains.map(domain => `url.ilike.*${domain}*`).join(',');
      query = query.or(companyFilters);
    }

    const { data, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, results: data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}