import { Migration } from '@mikro-orm/migrations';

export class Migration20261016045125_jobs extends Migration {

  override name = 'Migration20261016045125_jobs';

  override up(): void | Promise<void> {
    this.addSql(`create table "jobs" ("id" uuid not null, "kind" varchar(255) not null, "for_household_id" uuid null, "key" varchar(255) null, "payload" jsonb not null, "status" text not null default 'queued', "attempts" smallint not null default 0, "max_attempts" smallint not null default 3, "run_at" timestamptz not null, "started_at" timestamptz null, "finished_at" timestamptz null, "progress" jsonb null, "result" jsonb null, "error" text null, "created_by_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "jobs_kind_index" on "jobs" ("kind");`);
    this.addSql(`create index "jobs_for_household_id_index" on "jobs" ("for_household_id");`);
    this.addSql(`create index "jobs_key_index" on "jobs" ("key");`);
    this.addSql(`create index "jobs_status_index" on "jobs" ("status");`);
    this.addSql(`create index "jobs_run_at_index" on "jobs" ("run_at");`);

    this.addSql(`alter table "jobs" add constraint "jobs_for_household_id_foreign" foreign key ("for_household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "jobs" add constraint "jobs_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "jobs" add constraint "jobs_status_check" check ("status" in ('queued', 'running', 'done', 'failed', 'cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "jobs" cascade;`);
  }

}
