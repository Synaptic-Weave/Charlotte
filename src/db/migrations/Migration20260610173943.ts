import { Migration } from '@mikro-orm/migrations';

export class Migration20260610173943 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "customers" ("id" uuid not null, "tenant_id" uuid not null, "name" varchar(255) not null, "phone_number" varchar(255) not null, "context" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "customers_pkey" primary key ("id"));`);

    this.addSql(`alter table "customers" add constraint "customers_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);

    // Enable Row Level Security (RLS)
    this.addSql('ALTER TABLE customers ENABLE ROW LEVEL SECURITY;');
    
    // Create Row Level Security policies matching active tenant context
    this.addSql(`CREATE POLICY tenant_isolation_policy ON customers FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);
  }

  override async down(): Promise<void> {
    this.addSql('DROP POLICY tenant_isolation_policy ON customers;');
    this.addSql('ALTER TABLE customers DISABLE ROW LEVEL SECURITY;');

    this.addSql(`drop table if exists "customers" cascade;`);
  }

}
