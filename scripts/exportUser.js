const { Client } = require('pg');

async function exportUser() {
  const client = new Client({ connectionString: 'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable' });
  await client.connect();

  const email = 'mbrown77@gmail.com';
  
  const userRes = await client.query('SELECT * FROM users WHERE email = $1', [email]);
  if (userRes.rows.length === 0) {
    console.log('User not found');
    return;
  }
  const user = userRes.rows[0];
  console.log('User:', user);

  const tenantRes = await client.query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
  const tenant = tenantRes.rows[0];
  console.log('Tenant:', tenant);

  const orgRes = await client.query('SELECT * FROM organizations WHERE id = $1', [tenant.organization_id]);
  const org = orgRes.rows[0];
  console.log('Org:', org);

  const twilioRes = await client.query('SELECT * FROM twilio_phone_numbers WHERE tenant_id = $1', [tenant.id]);
  const twilio = twilioRes.rows;
  console.log('Twilio:', twilio);

  await client.end();
}

exportUser().catch(console.error);
