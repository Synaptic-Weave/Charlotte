import pg from 'pg';

const combinations = [
  { user: 'postgres', password: '', database: 'postgres' },
  { user: 'postgres', password: 'password', database: 'postgres' },
  { user: 'postgres', password: 'postgres', database: 'postgres' },
  { user: 'michaelbrown', password: '', database: 'postgres' },
  { user: 'michaelbrown', password: 'password', database: 'postgres' },
  { user: 'charlotte_admin', password: 'password', database: 'charlotte_db' },
  { user: 'charlotte_admin', password: '', database: 'charlotte_db' },
];

async function test() {
  for (const combo of combinations) {
    const client = new pg.Client({
      host: 'localhost',
      port: 5432,
      user: combo.user,
      password: combo.password,
      database: combo.database,
    });
    try {
      console.log(`Trying: user=${combo.user}, db=${combo.database}...`);
      await client.connect();
      console.log(`SUCCESS! Connected successfully with user=${combo.user}, db=${combo.database}`);
      await client.end();
      process.exit(0);
    } catch (err) {
      console.log(`Failed: ${err.message}`);
    }
  }
  console.log('All combinations failed!');
}

test();
