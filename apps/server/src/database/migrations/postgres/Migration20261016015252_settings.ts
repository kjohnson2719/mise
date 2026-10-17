import { Migration } from '@mikro-orm/migrations';

export class Migration20261016015252_settings extends Migration {

  override name = 'Migration20261016015252_settings';

  override up(): void | Promise<void> {
    this.addSql(`create table "secrets" ("id" uuid not null, "key_id" varchar(255) not null, "data_key" text not null, "value" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "secrets_key_id_index" on "secrets" ("key_id");`);

    this.addSql(`create table "server_settings" ("key" varchar(255) not null, "value" jsonb null, "secret_id" uuid null, "updated_at" timestamptz not null, "updated_by_id" uuid null, primary key ("key"));`);

    this.addSql(`create table "household_settings" ("id" uuid not null, "household_id" uuid not null, "key" varchar(255) not null, "value" jsonb null, "secret_id" uuid null, "updated_at" timestamptz not null, "updated_by_id" uuid null, primary key ("id"));`);
    this.addSql(`create index "household_settings_household_id_index" on "household_settings" ("household_id");`);
    this.addSql(`alter table "household_settings" add constraint "household_settings_household_id_key_unique" unique ("household_id", "key");`);

    this.addSql(`alter table "server_settings" add constraint "server_settings_secret_id_foreign" foreign key ("secret_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "server_settings" add constraint "server_settings_updated_by_id_foreign" foreign key ("updated_by_id") references "users" ("id") on delete set null;`);

    this.addSql(`alter table "household_settings" add constraint "household_settings_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "household_settings" add constraint "household_settings_secret_id_foreign" foreign key ("secret_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "household_settings" add constraint "household_settings_updated_by_id_foreign" foreign key ("updated_by_id") references "users" ("id") on delete set null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "server_settings" drop constraint "server_settings_secret_id_foreign";`);
    this.addSql(`alter table "household_settings" drop constraint "household_settings_secret_id_foreign";`);

    this.addSql(`drop table if exists "secrets" cascade;`);
    this.addSql(`drop table if exists "server_settings" cascade;`);
    this.addSql(`drop table if exists "household_settings" cascade;`);
  }

}
