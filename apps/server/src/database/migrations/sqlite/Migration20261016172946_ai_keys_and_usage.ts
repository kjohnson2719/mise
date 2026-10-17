import { Migration } from '@mikro-orm/migrations';

export class Migration20261016172946_ai_keys_and_usage extends Migration {

  override name = 'Migration20261016172946_ai_keys_and_usage';

  override up(): void | Promise<void> {
    this.addSql(`create table \`ai_usage\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text null, \`task\` text not null, \`provider\` text check (\`provider\` in ('anthropic', 'openai', 'google', 'openai-compatible')) not null, \`model\` text not null, \`source\` text check (\`source\` in ('server', 'household')) not null, \`month\` text not null, \`input_tokens\` integer not null, \`output_tokens\` integer not null, \`cost\` double null, \`created_at\` datetime not null, constraint \`ai_usage_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`ai_usage_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`ai_usage_household_id_index\` on \`ai_usage\` (\`household_id\`);`);
    this.addSql(`create index \`ai_usage_user_id_index\` on \`ai_usage\` (\`user_id\`);`);
    this.addSql(`create index \`ai_usage_household_id_month_index\` on \`ai_usage\` (\`household_id\`, \`month\`);`);
    this.addSql(`create index \`ai_usage_month_index\` on \`ai_usage\` (\`month\`);`);

    this.addSql(`create table \`ai_keys\` (\`id\` text not null primary key, \`household_id\` text null, \`provider\` text check (\`provider\` in ('anthropic', 'openai', 'google', 'openai-compatible')) not null, \`name\` text null, \`base_url\` text null, \`secret_id\` text null, \`hint\` text null, \`models\` json null, \`tested_at\` datetime null, \`created_by_id\` text null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`ai_keys_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`ai_keys_secret_id_foreign\` foreign key (\`secret_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`ai_keys_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`ai_keys_household_id_index\` on \`ai_keys\` (\`household_id\`);`);
    this.addSql(`create index \`ai_keys_secret_id_index\` on \`ai_keys\` (\`secret_id\`);`);
    this.addSql(`create index \`ai_keys_created_by_id_index\` on \`ai_keys\` (\`created_by_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`ai_usage\`;`);
    this.addSql(`drop table if exists \`ai_keys\`;`);
  }

}
