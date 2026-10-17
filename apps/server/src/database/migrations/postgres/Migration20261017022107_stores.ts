import { Migration } from '@mikro-orm/migrations';

export class Migration20261017022107_stores extends Migration {

  override name = 'Migration20261017022107_stores';

  override up(): void | Promise<void> {
    this.addSql(`create table "store_prices" ("id" uuid not null, "household_id" uuid not null, "store" varchar(255) not null, "product_id" varchar(255) not null, "day" varchar(10) not null, "price" int null, "sale_price" int null, "sale_ends" varchar(10) null, "currency" varchar(3) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "store_prices_household_id_index" on "store_prices" ("household_id");`);
    this.addSql(`alter table "store_prices" add constraint "store_prices_household_id_store_product_id_day_unique" unique ("household_id", "store", "product_id", "day");`);

    this.addSql(`create table "store_products" ("id" uuid not null, "household_id" uuid not null, "store" varchar(255) not null, "food" varchar(255) not null, "product" jsonb not null, "chosen" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "store_products_household_id_index" on "store_products" ("household_id");`);
    this.addSql(`alter table "store_products" add constraint "store_products_household_id_store_food_unique" unique ("household_id", "store", "food");`);

    this.addSql(`create table "store_connections" ("id" uuid not null, "household_id" uuid not null, "store" varchar(255) not null, "location" jsonb null, "modality" text not null default 'PICKUP', "account_id" uuid null, "access_expires_at" timestamptz null, "linked_by_id" uuid null, "linked_at" timestamptz null, "broken" boolean not null default false, "pending_state" varchar(255) null, "pending_verifier" text null, "pending_user_id" uuid null, "pending_until" timestamptz null, "last_sent" jsonb null, "prices_checked_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "store_connections_household_id_index" on "store_connections" ("household_id");`);
    this.addSql(`create index "store_connections_pending_state_index" on "store_connections" ("pending_state");`);
    this.addSql(`alter table "store_connections" add constraint "store_connections_household_id_store_unique" unique ("household_id", "store");`);

    this.addSql(`alter table "store_prices" add constraint "store_prices_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "store_products" add constraint "store_products_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "store_connections" add constraint "store_connections_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "store_connections" add constraint "store_connections_account_id_foreign" foreign key ("account_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "store_connections" add constraint "store_connections_linked_by_id_foreign" foreign key ("linked_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "store_connections" add constraint "store_connections_pending_user_id_foreign" foreign key ("pending_user_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "store_connections" add constraint "store_connections_modality_check" check ("modality" in ('PICKUP', 'DELIVERY'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "store_prices" cascade;`);
    this.addSql(`drop table if exists "store_products" cascade;`);
    this.addSql(`drop table if exists "store_connections" cascade;`);
  }

}
