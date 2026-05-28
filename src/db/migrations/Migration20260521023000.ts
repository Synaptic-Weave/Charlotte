import { Migration } from '@mikro-orm/migrations';

export class Migration20260521023000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "call_sessions" ("id" uuid not null, "tenant_id" uuid not null, "call_sid" varchar(255) not null, "stream_sid" varchar(255) null, "status" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "call_sessions_pkey" primary key ("id"));`);
    this.addSql(`alter table "call_sessions" add constraint "call_sessions_call_sid_unique" unique ("call_sid");`);
    this.addSql(`alter table "call_sessions" add constraint "call_sessions_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);

    // Enable Row-Level Security (RLS) for multi-tenant isolation
    this.addSql('ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;');
    this.addSql(`CREATE POLICY tenant_isolation_policy ON call_sessions FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);
  }

  override async down(): Promise<void> {
    this.addSql('DROP POLICY tenant_isolation_policy ON call_sessions;');
    this.addSql('ALTER TABLE call_sessions DISABLE ROW LEVEL SECURITY;');
    this.addSql(`drop table if exists "call_sessions" cascade;`);
  }

}
