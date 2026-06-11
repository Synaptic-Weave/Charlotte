import { Migration } from '@mikro-orm/migrations';

export class Migration20260611183954 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "messages" add column "recording_url" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "messages" drop column "recording_url";`);
  }

}
