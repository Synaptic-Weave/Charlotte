import { Migration } from '@mikro-orm/migrations';

export class Migration20260521000556 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "tenants" ("id" uuid not null, "name" varchar(255) not null, "destination_number" varchar(255) not null, "destination_verified" boolean not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "tenants_pkey" primary key ("id"));`);

    this.addSql(`create table "organizations" ("id" uuid not null, "tenant_id" uuid not null, "name" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "organizations_pkey" primary key ("id"));`);

    this.addSql(`create table "users" ("id" uuid not null, "tenant_id" uuid not null, "email" varchar(255) not null, "password_hash" varchar(255) not null, "role" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "users_pkey" primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);

    this.addSql(`alter table "organizations" add constraint "organizations_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "users" add constraint "users_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);

    // Enable Row Level Security (RLS) on multi-tenant tables
    this.addSql('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;');

    // Create Row Level Security policies matching active tenant context
    this.addSql(`CREATE POLICY tenant_isolation_policy ON tenants FOR ALL TO PUBLIC USING (id::text = current_setting('app.current_tenant_id', true));`);
    this.addSql(`CREATE POLICY tenant_isolation_policy ON users FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);
    this.addSql(`CREATE POLICY tenant_isolation_policy ON organizations FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);
  }

  override async down(): Promise<void> {
    this.addSql('DROP POLICY tenant_isolation_policy ON organizations;');
    this.addSql('DROP POLICY tenant_isolation_policy ON users;');
    this.addSql('DROP POLICY tenant_isolation_policy ON tenants;');

    this.addSql('ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE users DISABLE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;');

    this.addSql('alter table "users" drop constraint "users_tenant_id_foreign";');
    this.addSql('alter table "organizations" drop constraint "organizations_tenant_id_foreign";');
    this.addSql('drop table "users";');
    this.addSql('drop table "organizations";');
    this.addSql('drop table "tenants";');
  }

}
