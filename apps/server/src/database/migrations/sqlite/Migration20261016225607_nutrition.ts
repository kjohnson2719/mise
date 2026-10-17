import { Migration } from '@mikro-orm/migrations';

export class Migration20261016225607_nutrition extends Migration {

  override name = 'Migration20261016225607_nutrition';

  override up(): void | Promise<void> {
    this.addSql(`create table \`fdc_foods\` (\`fdc_id\` integer not null primary key autoincrement, \`description\` text not null, \`data_type\` text not null, \`nutrients\` json not null, \`portions\` json not null, \`created_at\` datetime not null);`);

    this.addSql(`create table \`food_matches\` (\`food\` text not null primary key, \`fdc_id\` integer null, \`grams\` json not null, \`updated_at\` datetime not null);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`fdc_foods\`;`);
    this.addSql(`drop table if exists \`food_matches\`;`);
  }

}
