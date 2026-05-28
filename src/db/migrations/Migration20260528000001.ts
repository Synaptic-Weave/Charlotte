import { Migration } from '@mikro-orm/migrations';

export class Migration20260528000001 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "call_sessions" add column "recording_url" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "call_sessions" drop column "recording_url";`);
  }

}
