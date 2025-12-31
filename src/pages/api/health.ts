import { getSupabaseClient, getSQLClient, isUsingLocalPostgres } from '../../lib/db';

export async function GET() {
  const useLocal = isUsingLocalPostgres();

  if (useLocal) {
    // Build SQL query directly
    const sql = getSQLClient();

    try {
      const data = await sql.unsafe('SELECT url FROM article LIMIT 200', []);

      return new Response(JSON.stringify({ ok: true, data: data || [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // Use Supabase (original logic)
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('article')
      .select('url')
      .limit(200);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
