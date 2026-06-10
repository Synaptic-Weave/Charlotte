import { Migration } from '@mikro-orm/migrations';

export class Migration20260610180438 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "departments" ("id" uuid not null, "tenant_id" uuid not null, "name" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "departments_pkey" primary key ("id"));`);

    this.addSql(`create table "appointments" ("id" uuid not null, "tenant_id" uuid not null, "department_id" uuid not null, "customer_id" uuid not null, "date" timestamptz not null, "status" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "appointments_pkey" primary key ("id"));`);

    this.addSql(`alter table "departments" add constraint "departments_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "appointments" add constraint "appointments_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "appointments" add constraint "appointments_department_id_foreign" foreign key ("department_id") references "departments" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "appointments" add constraint "appointments_customer_id_foreign" foreign key ("customer_id") references "customers" ("id") on update cascade on delete cascade;`);

    // Enable Row Level Security (RLS)
    this.addSql('ALTER TABLE departments ENABLE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;');
    
    // Create Row Level Security policies matching active tenant context
    this.addSql(`CREATE POLICY tenant_isolation_policy ON departments FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);
    this.addSql(`CREATE POLICY tenant_isolation_policy ON appointments FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);

    this.addSql(`alter table "call_sessions" alter column "recording_url" type varchar(255) using ("recording_url"::varchar(255));`);
  }

  override async down(): Promise<void> {
        this.addSql('DROP POLICY tenant_isolation_policy ON appointments;');
    this.addSql('DROP POLICY tenant_isolation_policy ON departments;');
    this.addSql('ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE departments DISABLE ROW LEVEL SECURITY;');

    this.addSql(`alter table "appointments" drop constraint "appointments_department_id_foreign";`);

    this.addSql(`drop table if exists "departments" cascade;`);

    this.addSql(`drop table if exists "appointments" cascade;`);

    this.addSql(`alter table "call_sessions" alter column "recording_url" type text using ("recording_url"::text);`);
  }

}
