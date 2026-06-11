import { Migration } from '@mikro-orm/migrations';

export class Migration20260611013238 extends Migration {

  override async up(): Promise<void> {
    this.addSql('ALTER TABLE call_sessions FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE twilio_phone_numbers FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE customers FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE appointments FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE departments FORCE ROW LEVEL SECURITY;');
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE departments NO FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE appointments NO FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE customers NO FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE twilio_phone_numbers NO FORCE ROW LEVEL SECURITY;');
    this.addSql('ALTER TABLE call_sessions NO FORCE ROW LEVEL SECURITY;');
  }

}
