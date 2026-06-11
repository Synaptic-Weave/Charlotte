import { Migration } from '@mikro-orm/migrations';

export class Migration20260611221058 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "tenants" add column "google_refresh_token" varchar(255) null, add column "google_calendar_id" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "tenants" drop column "google_refresh_token", drop column "google_calendar_id";`);
  }

}
