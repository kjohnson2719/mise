import { Migration } from '@mikro-orm/migrations';

export class Migration20261016001140_rate_limits extends Migration {

  override name = 'Migration20261016001140_rate_limits';

  override up(): void | Promise<void> {
    this.addSql(`create table \`rate_limits\` (\`id\` text not null primary key, \`key\` text not null, \`count\` integer not null, \`last_request\` bigint not null);`);
    this.addSql(`create unique index \`rate_limits_key_unique\` on \`rate_limits\` (\`key\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`rate_limits\`;`);
  }

}
