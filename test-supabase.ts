import { getSupabaseClient, isUsingLocalPostgres } from './src/lib/db';

async function testSupabase() {
  console.log('Testing Supabase connection...\n');
  
  // Check environment variables
  console.log('Environment variables:');
  console.log(`  LOCAL_POSTGRES_DSN: ${process.env.LOCAL_POSTGRES_DSN ? 'SET' : 'NOT SET'}`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? 'SET' : 'NOT SET'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'}\n`);
  
  const useLocal = isUsingLocalPostgres();
  console.log(`Using local PostgreSQL: ${useLocal}\n`);
  
  if (useLocal) {
    console.log('❌ ERROR: LOCAL_POSTGRES_DSN is set, but we want to test Supabase');
    console.log('Please unset LOCAL_POSTGRES_DSN: unset LOCAL_POSTGRES_DSN');
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('❌ ERROR: Supabase environment variables are not set');
    console.log('Please set:');
    console.log('  export SUPABASE_URL=your_supabase_url');
    console.log('  export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
    process.exit(1);
  }

  try {
    const supabase = getSupabaseClient();
    console.log('✓ Supabase client created successfully');
    
    // Test 1: Simple query
    console.log('\nTest 1: Testing basic connection...');
    const { data, error } = await supabase
      .from('article')
      .select('title, url')
      .limit(5);

    if (error) {
      console.error('❌ Supabase error:', error.message);
      process.exit(1);
    }

    console.log('✓ Connection successful!');
    console.log(`Found ${data?.length || 0} sample articles:`);
    if (data && data.length > 0) {
      data.slice(0, 3).forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.title}`);
        console.log(`     ${row.url}`);
      });
    }

    // Test 2: Count query
    console.log('\nTest 2: Testing count query...');
    const { count, error: countError } = await supabase
      .from('article')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Count error:', countError.message);
      process.exit(1);
    }

    console.log(`✓ Total articles: ${count || 0}`);

    console.log('\n✅ All Supabase tests passed!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testSupabase().catch(console.error);

