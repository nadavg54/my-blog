import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

// Check if we should use local PostgreSQL
const useLocalPostgres = !!process.env.LOCAL_POSTGRES_DSN;

// Initialize database connection
let supabase: ReturnType<typeof createClient> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

if (useLocalPostgres) {
  // Use local PostgreSQL
  sql = postgres(process.env.LOCAL_POSTGRES_DSN!);
} else {
  // Use Supabase
  supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Database query result type
export interface QueryResult<T = any> {
  data: T[] | null;
  error: { message: string } | null;
}

// Get SQL client (for building parameterized queries with template tags)
export function getSQLClient() {
  if (!useLocalPostgres || !sql) {
    throw new Error('Local PostgreSQL is not configured');
  }
  return sql;
}


// Get Supabase client (for Supabase queries)
export function getSupabaseClient() {
  if (useLocalPostgres || !supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

// Check if using local PostgreSQL
export function isUsingLocalPostgres(): boolean {
  return useLocalPostgres;
}

