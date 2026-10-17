import { Migration } from '@mikro-orm/migrations';

export class Migration20261016214433_receipts extends Migration {

  override name = 'Migration20261016214433_receipts';

  override up(): void | Promise<void> {
    this.addSql(`create table \`receipts\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text null, \`store\` text null, \`date\` text null, \`total\` double null, \`lines\` json not null, \`files\` json not null, \`created_at\` datetime not null, constraint \`receipts_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`receipts_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`receipts_household_id_index\` on \`receipts\` (\`household_id\`);`);
    this.addSql(`create index \`receipts_user_id_index\` on \`receipts\` (\`user_id\`);`);
    this.addSql(`create index \`receipts_household_id_created_at_index\` on \`receipts\` (\`household_id\`, \`created_at\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`receipts\`;`);
  }

}
