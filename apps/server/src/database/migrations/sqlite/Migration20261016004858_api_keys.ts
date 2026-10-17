import { Migration } from '@mikro-orm/migrations';

export class Migration20261016004858_api_keys extends Migration {

  override name = 'Migration20261016004858_api_keys';

  override up(): void | Promise<void> {
    this.addSql(`create table \`api_keys\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text not null, \`name\` text not null, \`start\` text not null, \`key_hash\` text not null, \`permissions\` json not null, \`expires_at\` datetime null, \`last_used_at\` datetime null, \`created_at\` datetime not null, constraint \`api_keys_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`api_keys_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`api_keys_household_id_index\` on \`api_keys\` (\`household_id\`);`);
    this.addSql(`create index \`api_keys_user_id_index\` on \`api_keys\` (\`user_id\`);`);
    this.addSql(`create unique index \`api_keys_key_hash_unique\` on \`api_keys\` (\`key_hash\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`api_keys\`;`);
  }

}
