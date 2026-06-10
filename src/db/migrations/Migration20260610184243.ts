import { Migration } from '@mikro-orm/migrations';

export class Migration20260610184243 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "departments" add column "routing_number" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "departments" drop column "routing_number";`);
  }

}
