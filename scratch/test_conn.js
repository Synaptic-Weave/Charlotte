const { Client } = require('pg');

const urls = [
  'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable',
  'postgresql://postgres:password@localhost:5432/charlotte_db?sslmode=disable',
  'postgresql://postgres@localhost:5432/charlotte_db?sslmode=disable',
  'postgresql://postgres:password@localhost:5432/postgres?sslmode=disable',
  'postgresql://postgres@localhost:5432/postgres?sslmode=disable',
  'postgresql://michaelbrown@localhost:5432/postgres?sslmode=disable',
  'postgresql://localhost:5432/postgres?sslmode=disable',
];

async function main() {
  for (const url of urls) {
    console.log('Trying URL:', url);
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      console.log('SUCCESS!');
      const res = await client.query('SELECT current_user, current_database()');
      console.log('Result:', res.rows[0]);
      await client.end();
      break;
    } catch (err) {
      console.log('FAILED:', err.message);
    }
  }
}

main();
