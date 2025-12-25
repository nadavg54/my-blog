import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const urlObj = new URL(request.url);

  const titleQuery = urlObj.searchParams.get('title') || '';
  const textQuery = urlObj.searchParams.get('text') || '';
  const urlQuery = urlObj.searchParams.get('url') || '';

  console.log('TITLE:', titleQuery);
  console.log('TEXT:', textQuery);
  console.log('URL:', urlQuery);

  if (!titleQuery && !textQuery && !urlQuery) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Missing query parameter: title, text, or url',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let query = supabase.from('article').select('title, url');

  if (titleQuery) {
    query = query.ilike('title', `%${titleQuery}%`);
  }

  if (textQuery) {
    query = query.ilike('text', `%${textQuery}%`);
  }

  if (urlQuery) {
    query = query.ilike('url', `%${urlQuery}%`);
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
