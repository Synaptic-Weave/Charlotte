import { Migration } from '@mikro-orm/migrations';

export class Migration20260613123456 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      DO $$
      DECLARE
        sa_id uuid := gen_random_uuid();
        ta_id uuid := gen_random_uuid();
      BEGIN
        INSERT INTO user_roles (id, type, created_at) VALUES (sa_id, 'super_admin', NOW());
        INSERT INTO user_roles (id, type, created_at) VALUES (ta_id, 'tenant_admin', NOW());

        UPDATE users SET role_id = sa_id WHERE email IN ('mbrown77@gmail.com', 'mbrown@synapticweave.com');
        UPDATE users SET role_id = ta_id WHERE email NOT IN ('mbrown77@gmail.com', 'mbrown@synapticweave.com');
      END $$;
    `);
  }

  async down(): Promise<void> {
    this.addSql(`UPDATE users SET role_id = NULL;`);
    this.addSql(`DELETE FROM user_roles;`);
  }
}
