import { Migration } from '@mikro-orm/migrations';

export class Migration20260611234209 extends Migration {

  override async up(): Promise<void> {
    this.addSql('ALTER TABLE twilio_phone_numbers NO FORCE ROW LEVEL SECURITY;');
    this.addSql(`drop table if exists "messages" cascade;`);

    this.addSql(`alter table "call_sessions" drop column "caller_name", drop column "caller_purpose";`);
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE twilio_phone_numbers FORCE ROW LEVEL SECURITY;');
    this.addSql(`create table "messages" ("id" uuid not null, "tenant_id" uuid not null, "call_session_id" uuid not null, "summary" text not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "recording_url" varchar(255) null, constraint "messages_pkey" primary key ("id"));`);

    this.addSql(`alter table "messages" add constraint "messages_call_session_id_foreign" foreign key ("call_session_id") references "call_sessions" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "messages" add constraint "messages_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "call_sessions" add column "caller_name" varchar(255) null, add column "caller_purpose" varchar(255) null;`);
  }

}
