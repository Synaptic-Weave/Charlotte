import { Migration } from '@mikro-orm/migrations';

export class Migration20260607003404 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "call_sessions" add column "caller_number" varchar(255) not null default 'Unknown', add column "messages" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "call_sessions" drop column "caller_number", drop column "messages";`);
  }

}
