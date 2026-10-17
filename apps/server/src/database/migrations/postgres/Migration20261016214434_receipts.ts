import { Migration } from '@mikro-orm/migrations';

export class Migration20261016214434_receipts extends Migration {

  override name = 'Migration20261016214434_receipts';

  override up(): void | Promise<void> {
    this.addSql(`create table "receipts" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid null, "store" varchar(255) null, "date" varchar(10) null, "total" double precision null, "lines" jsonb not null, "files" jsonb not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "receipts_household_id_index" on "receipts" ("household_id");`);
    this.addSql(`create index "receipts_household_id_created_at_index" on "receipts" ("household_id", "created_at");`);

    this.addSql(`alter table "receipts" add constraint "receipts_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "receipts" add constraint "receipts_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "receipts" cascade;`);
  }

}
