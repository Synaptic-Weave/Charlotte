import { Migration } from '@mikro-orm/migrations';

export class Migration20260613015055 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user_roles" ("id" uuid not null, "name" varchar(255) not null, "display_name" varchar(255) not null, "description" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "type" text check ("type" in ('super_admin', 'tenant_admin')) not null, constraint "user_roles_pkey" primary key ("id"));`);
    this.addSql(`alter table "user_roles" add constraint "user_roles_name_unique" unique ("name");`);
    this.addSql(`create index "user_roles_type_index" on "user_roles" ("type");`);

    this.addSql(`create table "user_roles_mapping" ("user_id" uuid not null, "user_role_id" uuid not null, constraint "user_roles_mapping_pkey" primary key ("user_id", "user_role_id"));`);

    this.addSql(`alter table "user_roles_mapping" add constraint "user_roles_mapping_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "user_roles_mapping" add constraint "user_roles_mapping_user_role_id_foreign" foreign key ("user_role_id") references "user_roles" ("id") on update cascade on delete cascade;`);

    // Seed Roles
    this.addSql(`insert into "user_roles" ("id", "name", "display_name", "description", "created_at", "updated_at", "type") values (gen_random_uuid(), 'SuperAdmin', 'Super Admin', 'Platform super administrator', now(), now(), 'super_admin');`);
    this.addSql(`insert into "user_roles" ("id", "name", "display_name", "description", "created_at", "updated_at", "type") values (gen_random_uuid(), 'TenantAdmin', 'Tenant Admin', 'Tenant administrator', now(), now(), 'tenant_admin');`);

    // Assign SuperAdmin to users
    this.addSql(`
      insert into "user_roles_mapping" ("user_id", "user_role_id")
      select u."id", r."id" 
      from "users" u 
      cross join "user_roles" r 
      where u."email" in ('mbrown77@gmail.com', 'mbrown@synapticweave.com') 
      and r."name" = 'SuperAdmin';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user_roles_mapping" drop constraint "user_roles_mapping_user_role_id_foreign";`);

    this.addSql(`drop table if exists "user_roles" cascade;`);

    this.addSql(`drop table if exists "user_roles_mapping" cascade;`);
  }

}
