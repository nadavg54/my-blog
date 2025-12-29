import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const urlObj = new URL(request.url);
  
  // Get all instances of our complex logic parameters
  const orGroups = urlObj.searchParams.getAll('orGroup'); 
  const excludes = urlObj.searchParams.getAll('exclude');
  const titleFilter = urlObj.searchParams.get('title');
  const urlFilter = urlObj.searchParams.get('url');

  // Safety check: if no query, return empty results
  if (orGroups.length === 0 && excludes.length === 0 && !titleFilter && !urlFilter) {
    return new Response(JSON.stringify({ ok: true, results: [] }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

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