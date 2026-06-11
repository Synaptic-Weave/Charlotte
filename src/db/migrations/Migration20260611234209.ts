import { Migration } from '@mikro-orm/migrations';

export class Migration20260611234209 extends Migration {

  override async up(): Promise<void> {
    this.addSql('ALTER TABLE twilio_phone_numbers NO FORCE ROW LEVEL SECURITY;');
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE twilio_phone_numbers FORCE ROW LEVEL SECURITY;');
  }

}
