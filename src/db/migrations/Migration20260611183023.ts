import { Migration } from '@mikro-orm/migrations';

export class Migration20260611183023 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "call_sessions" add column "caller_name" varchar(255) null, add column "caller_purpose" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "call_sessions" drop column "caller_name", drop column "caller_purpose";`);
  }

}
