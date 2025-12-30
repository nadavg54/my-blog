import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  
  // Get all instances of our complex logic parameters
  const orGroups = urlObj.searchParams.getAll('orGroup'); 
  const excludes = urlObj.searchParams.getAll('exclude');
  const titleFilter = urlObj.searchParams.get('title');
  const selectedPodcasts = urlObj.searchParams.getAll('podcast');

  // Safety check: if no query, return empty results
  if (orGroups.length === 0 && excludes.length === 0 && !titleFilter && selectedPodcasts.length === 0) {
    return new Response(JSON.stringify({ ok: true, results: [] }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  let query = supabase.from('article').select('title, url');

  // Build podcast filter (URL contains podcast domain) - OR between selected podcasts
  // If no podcasts selected, default to all podcasts
  const podcastsToFilter = selectedPodcasts.length > 0 
    ? selectedPodcasts 
    : Object.keys(PODCAST_DOMAINS);

  const podcastFilters = podcastsToFilter
    .map(podcastKey => {
      const domain = PODCAST_DOMAINS[podcastKey];
      return domain ? `url.ilike.*${domain}*` : null;
    })
    .filter((f): f is string => f !== null);

  // Build text search filter (OR Groups) - OR between groups, AND within groups
  let textSearchFilter: string | null = null;
  if (orGroups.length > 0) {
    const orFilterSegments = orGroups.map(groupStr => {
      const andWords = groupStr.split('|');
      // Create 'and' logic for terms within the same chip group
      const andSegment = andWords.map(word => `text.ilike.*${word}*`).join(',');
      return `and(${andSegment})`;
    });
    textSearchFilter = orFilterSegments.join(',');
  }

  // Apply filters: podcast filter (OR on URL) AND text search (OR on text)
  // The problem: .or() replaces previous OR, so we can't use it twice
  // Solution: Apply podcast filter first, then combine with text search
  // using PostgREST's ability to AND multiple conditions
  
  // 1. Apply podcast filter (OR between selected podcast domains on URL)
  if (podcastFilters.length > 0) {
    query = query.or(podcastFilters.join(','));
  }
  
  // 2. Apply text search filter (OR between groups on text field)
  // Since .or() replaces previous OR, we need to combine both into one filter
  // PostgREST supports nested filters: and(or(url), or(text))
  if (textSearchFilter) {
    if (podcastFilters.length > 0) {
      // Both filters: combine using nested PostgREST syntax
      // The .or() method should accept nested filter syntax
      const combined = `and(or(${podcastFilters.join(',')}),or(${textSearchFilter}))`;
      // Re-apply the combined filter (this replaces the previous .or())
      query = supabase.from('article').select('title, url').or(combined);
    } else {
      // Only text search
      query = query.or(textSearchFilter);
    }
  }

  // 3. Process Universal Exclusions
  if (excludes.length > 0) {
    excludes.forEach(word => {
      // Chaining .not in PostgREST acts as "AND NOT"
      query = query.not('text', 'ilike', `%${word}%`);
    });
  }

  // 4. Apply Title Filter (AND condition)
  if (titleFilter) {
    query = query.ilike('title', `%${titleFilter}%`);
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

