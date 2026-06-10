const { Client } = require('pg');

async function migrateUser() {
  const localClient = new Client({ connectionString: 'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable' });
  
  // Connect to remote via Cloud SQL proxy running on port 5434
  const remoteClient = new Client({ connectionString: 'postgresql://charlotte_admin:dRYuDLr9ekl%3Cts%26k@localhost:5434/charlotte_db?sslmode=disable' });

  await localClient.connect();
  await remoteClient.connect();

  const email = 'mbrown77@gmail.com';
  
  try {
    // 1. Fetch data from local
    console.log('Fetching local data...');
    const userRes = await localClient.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      console.log('User not found locally');
      return;
    }
    const user = userRes.rows[0];

    const tenantRes = await localClient.query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
    const tenant = tenantRes.rows[0];

    const orgRes = await localClient.query('SELECT * FROM organizations WHERE id = $1', [tenant.organization_id]);
    const org = orgRes.rows[0];

    const twilioRes = await localClient.query('SELECT * FROM twilio_phone_numbers WHERE tenant_id = $1', [tenant.id]);
    const twilioNums = twilioRes.rows;

    // 2. Insert into remote
    console.log('Inserting into remote...');
    
    // Org
    await remoteClient.query(
      `INSERT INTO organizations (id, name, created_at, updated_at) 
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [org.id, org.name, org.created_at, org.updated_at]
    );
    console.log('Organization inserted.');

    // Tenant
    await remoteClient.query(
      `INSERT INTO tenants (id, name, organization_id, subscription_tier, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [tenant.id, tenant.name, tenant.organization_id, tenant.subscription_tier, tenant.created_at, tenant.updated_at]
    );
    console.log('Tenant inserted.');

    // User
    await remoteClient.query(
      `INSERT INTO users (id, email, password_hash, role, tenant_id, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [user.id, user.email, user.password_hash, user.role, user.tenant_id, user.created_at, user.updated_at]
    );
    console.log('User inserted/updated.');

    // Twilio numbers
    for (const num of twilioNums) {
      await remoteClient.query(
        `INSERT INTO twilio_phone_numbers (id, phone_number, twilio_sid, status, tenant_id, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (phone_number) DO NOTHING`,
        [num.id, num.phone_number, num.twilio_sid, num.status, num.tenant_id, num.created_at, num.updated_at]
      );
      console.log(`Twilio number ${num.phone_number} inserted.`);
    }

    console.log('Migration completed successfully!');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await localClient.end();
    await remoteClient.end();
  }
}

migrateUser().catch(console.error);
