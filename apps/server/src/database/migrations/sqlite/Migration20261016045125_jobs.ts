import { Migration } from '@mikro-orm/migrations';

export class Migration20261016045125_jobs extends Migration {

  override name = 'Migration20261016045125_jobs';

  override up(): void | Promise<void> {
    this.addSql(`create table \`jobs\` (\`id\` text not null primary key, \`kind\` text not null, \`for_household_id\` text null, \`key\` text null, \`payload\` json not null, \`status\` text check (\`status\` in ('queued', 'running', 'done', 'failed', 'cancelled')) not null default 'queued', \`attempts\` integer not null default 0, \`max_attempts\` integer not null default 3, \`run_at\` datetime not null, \`started_at\` datetime null, \`finished_at\` datetime null, \`progress\` json null, \`result\` json null, \`error\` text null, \`created_by_id\` text null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`jobs_for_household_id_foreign\` foreign key (\`for_household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`jobs_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`jobs_kind_index\` on \`jobs\` (\`kind\`);`);
    this.addSql(`create index \`jobs_for_household_id_index\` on \`jobs\` (\`for_household_id\`);`);
    this.addSql(`create index \`jobs_key_index\` on \`jobs\` (\`key\`);`);
    this.addSql(`create index \`jobs_status_index\` on \`jobs\` (\`status\`);`);
    this.addSql(`create index \`jobs_run_at_index\` on \`jobs\` (\`run_at\`);`);
    this.addSql(`create index \`jobs_created_by_id_index\` on \`jobs\` (\`created_by_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`jobs\`;`);
  }

}
