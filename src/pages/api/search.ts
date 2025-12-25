import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // Parse the URL properly
  const url = new URL(request.url);
  const query = url.searchParams.get('q');

  console.log('FULL URL:', request.url);
  console.log('QUERY STRING:', query);

  if (!query) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing query parameter "q"' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data, error } = await supabase
    .from('article')
    .select('title, url')
    .ilike('title', `%${query}%`)
    .or(`text.ilike.%${query}%`);

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
