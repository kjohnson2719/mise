import { Migration } from '@mikro-orm/migrations';

export class Migration20261016191453_tidy_up extends Migration {

  override name = 'Migration20261016191453_tidy_up';

  override up(): void | Promise<void> {
    this.addSql(`create table "proposals" ("id" uuid not null, "household_id" uuid not null, "kind" text not null, "recipe_id" uuid null, "status" text not null, "summary" text not null, "before" jsonb not null, "after" jsonb not null, "job" varchar(255) null, "created_by_id" uuid null, "created_at" timestamptz not null, "resolved_by_id" uuid null, "resolved_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "proposals_household_id_index" on "proposals" ("household_id");`);
    this.addSql(`create index "proposals_recipe_id_index" on "proposals" ("recipe_id");`);
    this.addSql(`create index "proposals_household_id_status_index" on "proposals" ("household_id", "status");`);

    this.addSql(`alter table "recipes" add "tidied_at" timestamptz null;`);

    this.addSql(`alter table "recipe_ingredients" add "mark" text null;`);
    this.addSql(`alter table "recipe_ingredients" add constraint "recipe_ingredients_mark_check" check ("mark" in ('needed', 'swappable', 'optional'));`);

    this.addSql(`alter table "proposals" add constraint "proposals_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "proposals" add constraint "proposals_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "proposals" add constraint "proposals_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "proposals" add constraint "proposals_resolved_by_id_foreign" foreign key ("resolved_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "proposals" add constraint "proposals_kind_check" check ("kind" in ('tidy'));`);
    this.addSql(`alter table "proposals" add constraint "proposals_status_check" check ("status" in ('pending', 'applied', 'dismissed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "proposals" cascade;`);

    this.addSql(`alter table "recipe_ingredients" drop constraint "recipe_ingredients_mark_check";`);
    this.addSql(`alter table "recipe_ingredients" drop column "mark";`);

    this.addSql(`alter table "recipes" drop column "tidied_at";`);
  }

}
