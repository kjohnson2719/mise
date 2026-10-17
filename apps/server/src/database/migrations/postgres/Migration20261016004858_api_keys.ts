import { Migration } from '@mikro-orm/migrations';

export class Migration20261016004858_api_keys extends Migration {

  override name = 'Migration20261016004858_api_keys';

  override up(): void | Promise<void> {
    this.addSql(`create table "api_keys" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid not null, "name" varchar(255) not null, "start" varchar(255) not null, "key_hash" varchar(255) not null, "permissions" jsonb not null, "expires_at" timestamptz null, "last_used_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "api_keys_household_id_index" on "api_keys" ("household_id");`);
    this.addSql(`create index "api_keys_user_id_index" on "api_keys" ("user_id");`);
    this.addSql(`alter table "api_keys" add constraint "api_keys_key_hash_unique" unique ("key_hash");`);

    this.addSql(`alter table "api_keys" add constraint "api_keys_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "api_keys" add constraint "api_keys_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "api_keys" cascade;`);
  }

}
