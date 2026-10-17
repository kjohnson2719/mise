import { Migration } from '@mikro-orm/migrations';

export class Migration20261016172947_ai_keys_and_usage extends Migration {

  override name = 'Migration20261016172947_ai_keys_and_usage';

  override up(): void | Promise<void> {
    this.addSql(`create table "ai_usage" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid null, "task" varchar(255) not null, "provider" text not null, "model" varchar(255) not null, "source" text not null, "month" varchar(255) not null, "input_tokens" int not null, "output_tokens" int not null, "cost" double precision null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "ai_usage_household_id_index" on "ai_usage" ("household_id");`);
    this.addSql(`create index "ai_usage_household_id_month_index" on "ai_usage" ("household_id", "month");`);
    this.addSql(`create index "ai_usage_month_index" on "ai_usage" ("month");`);

    this.addSql(`create table "ai_keys" ("id" uuid not null, "household_id" uuid null, "provider" text not null, "name" varchar(255) null, "base_url" text null, "secret_id" uuid null, "hint" varchar(255) null, "models" jsonb null, "tested_at" timestamptz null, "created_by_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "ai_keys_household_id_index" on "ai_keys" ("household_id");`);

    this.addSql(`alter table "ai_usage" add constraint "ai_usage_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "ai_usage" add constraint "ai_usage_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "ai_usage" add constraint "ai_usage_provider_check" check ("provider" in ('anthropic', 'openai', 'google', 'openai-compatible'));`);
    this.addSql(`alter table "ai_usage" add constraint "ai_usage_source_check" check ("source" in ('server', 'household'));`);

    this.addSql(`alter table "ai_keys" add constraint "ai_keys_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "ai_keys" add constraint "ai_keys_secret_id_foreign" foreign key ("secret_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "ai_keys" add constraint "ai_keys_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "ai_keys" add constraint "ai_keys_provider_check" check ("provider" in ('anthropic', 'openai', 'google', 'openai-compatible'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "ai_usage" cascade;`);
    this.addSql(`drop table if exists "ai_keys" cascade;`);
  }

}
