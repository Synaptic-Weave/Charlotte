const { Client } = require('pg');

async function exportSql() {
  const localClient = new Client({ connectionString: 'postgresql://charlotte_admin:password@localhost:5432/charlotte_db?sslmode=disable' });
  await localClient.connect();

  const email = 'mbrown77@gmail.com';
  
  try {
    const userRes = await localClient.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) return console.log('User not found');
    const user = userRes.rows[0];
    const tenantRes = await localClient.query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
    const tenant = tenantRes.rows[0];
    const twilioRes = await localClient.query('SELECT * FROM twilio_phone_numbers WHERE tenant_id = $1', [tenant.id]);
    const twilioNums = twilioRes.rows;

    let sql = `-- Migration SQL for ${email}\n`;
    sql += `INSERT INTO tenants (id, name, destination_number, destination_verified, created_at, updated_at) VALUES ('${tenant.id}', '${tenant.name.replace(/'/g, "''")}', '${tenant.destination_number || ''}', ${tenant.destination_verified}, '${tenant.created_at.toISOString()}', '${tenant.updated_at.toISOString()}') ON CONFLICT (id) DO NOTHING;\n`;
    sql += `INSERT INTO users (id, email, password_hash, role, tenant_id, created_at, updated_at) VALUES ('${user.id}', '${user.email.replace(/'/g, "''")}', '${user.password_hash.replace(/'/g, "''")}', '${user.role}', '${user.tenant_id}', '${user.created_at.toISOString()}', '${user.updated_at.toISOString()}') ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, tenant_id = EXCLUDED.tenant_id;\n`;
    
    for (const num of twilioNums) {
      sql += `INSERT INTO twilio_phone_numbers (id, phone_number, friendly_name, created_at, updated_at, tenant_id) VALUES ('${num.id}', '${num.phone_number}', '${num.friendly_name.replace(/'/g, "''")}', '${num.created_at.toISOString()}', '${num.updated_at.toISOString()}', '${num.tenant_id}') ON CONFLICT (phone_number) DO NOTHING;\n`;
    }
    
    console.log(sql);

  } catch (err) {
    console.error(err);
  } finally {
    await localClient.end();
  }
}

exportSql().catch(console.error);
