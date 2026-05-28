import { Migration } from '@mikro-orm/migrations';

export class Migration20260521015453 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "twilio_phone_numbers" ("id" uuid not null, "tenant_id" uuid not null, "phone_number" varchar(255) not null, "friendly_name" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "twilio_phone_numbers_pkey" primary key ("id"));`);
    this.addSql(`alter table "twilio_phone_numbers" add constraint "twilio_phone_numbers_phone_number_unique" unique ("phone_number");`);

    this.addSql(`alter table "twilio_phone_numbers" add constraint "twilio_phone_numbers_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);

    // Enable Row-Level Security (RLS) for multi-tenant isolation
    this.addSql('ALTER TABLE twilio_phone_numbers ENABLE ROW LEVEL SECURITY;');
    this.addSql(`CREATE POLICY tenant_isolation_policy ON twilio_phone_numbers FOR ALL TO PUBLIC USING (tenant_id::text = current_setting('app.current_tenant_id', true));`);
  }

  override async down(): Promise<void> {
    this.addSql('DROP POLICY tenant_isolation_policy ON twilio_phone_numbers;');
    this.addSql('ALTER TABLE twilio_phone_numbers DISABLE ROW LEVEL SECURITY;');
    this.addSql(`drop table if exists "twilio_phone_numbers" cascade;`);
  }

}
