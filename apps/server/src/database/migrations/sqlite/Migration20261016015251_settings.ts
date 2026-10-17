import { Migration } from '@mikro-orm/migrations';

export class Migration20261016015251_settings extends Migration {

  override name = 'Migration20261016015251_settings';

  override up(): void | Promise<void> {
    this.addSql(`create table \`secrets\` (\`id\` text not null primary key, \`key_id\` text not null, \`data_key\` text not null, \`value\` text not null, \`created_at\` datetime not null, \`updated_at\` datetime not null);`);
    this.addSql(`create index \`secrets_key_id_index\` on \`secrets\` (\`key_id\`);`);

    this.addSql(`create table \`server_settings\` (\`key\` text not null primary key, \`value\` json null, \`secret_id\` text null, \`updated_at\` datetime not null, \`updated_by_id\` text null, constraint \`server_settings_secret_id_foreign\` foreign key (\`secret_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`server_settings_updated_by_id_foreign\` foreign key (\`updated_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`server_settings_secret_id_index\` on \`server_settings\` (\`secret_id\`);`);
    this.addSql(`create index \`server_settings_updated_by_id_index\` on \`server_settings\` (\`updated_by_id\`);`);

    this.addSql(`create table \`household_settings\` (\`id\` text not null primary key, \`household_id\` text not null, \`key\` text not null, \`value\` json null, \`secret_id\` text null, \`updated_at\` datetime not null, \`updated_by_id\` text null, constraint \`household_settings_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`household_settings_secret_id_foreign\` foreign key (\`secret_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`household_settings_updated_by_id_foreign\` foreign key (\`updated_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`household_settings_household_id_index\` on \`household_settings\` (\`household_id\`);`);
    this.addSql(`create index \`household_settings_secret_id_index\` on \`household_settings\` (\`secret_id\`);`);
    this.addSql(`create index \`household_settings_updated_by_id_index\` on \`household_settings\` (\`updated_by_id\`);`);
    this.addSql(`create unique index \`household_settings_household_id_key_unique\` on \`household_settings\` (\`household_id\`, \`key\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`secrets\`;`);
    this.addSql(`drop table if exists \`server_settings\`;`);
    this.addSql(`drop table if exists \`household_settings\`;`);
  }

}
