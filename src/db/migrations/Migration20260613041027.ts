import { Migration } from '@mikro-orm/migrations';

export class Migration20260613041027 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user_roles" ("id" uuid not null, "type" varchar(255) not null, "created_at" timestamptz not null, constraint "user_roles_pkey" primary key ("id"));`);
    this.addSql(`create index "user_roles_type_index" on "user_roles" ("type");`);

    this.addSql(`alter table "users" drop column "role";`);

    this.addSql(`alter table "users" add column "role_id" uuid not null;`);
    this.addSql(`alter table "users" add constraint "users_role_id_foreign" foreign key ("role_id") references "user_roles" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "users" drop constraint "users_role_id_foreign";`);

    this.addSql(`drop table if exists "user_roles" cascade;`);

    this.addSql(`alter table "users" drop column "role_id";`);

    this.addSql(`alter table "users" add column "role" varchar(255) not null;`);
  }

}
