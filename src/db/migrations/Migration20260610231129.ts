import { Migration } from '@mikro-orm/migrations';

export class Migration20260610231129 extends Migration {

  override async up(): Promise<void> {
    this.addSql('ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;');
    this.addSql('DROP POLICY IF EXISTS tenant_isolation_policy ON call_sessions;');
    this.addSql(`CREATE POLICY tenant_isolation_policy ON call_sessions FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);
  }

  override async down(): Promise<void> {
    this.addSql('DROP POLICY tenant_isolation_policy ON call_sessions;');
    this.addSql('ALTER TABLE call_sessions DISABLE ROW LEVEL SECURITY;');
  }

}
