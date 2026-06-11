import { Migration } from '@mikro-orm/migrations';

export class Migration20260611183508 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "messages" ("id" uuid not null, "tenant_id" uuid not null, "call_session_id" uuid not null, "summary" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "messages_pkey" primary key ("id"));`);

    this.addSql(`alter table "messages" add constraint "messages_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "messages" add constraint "messages_call_session_id_foreign" foreign key ("call_session_id") references "call_sessions" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "messages" cascade;`);
  }

}
