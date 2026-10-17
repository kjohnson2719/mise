import { Migration } from '@mikro-orm/migrations';

export class Migration20261017084738_foods_household extends Migration {

  override name = 'Migration20261017084738_foods_household';

  override up(): void | Promise<void> {
    this.addSql(`create table "food_aliases" ("id" uuid not null, "household_id" uuid not null, "name" varchar(255) not null, "food_key" varchar(255) not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "food_aliases_household_id_index" on "food_aliases" ("household_id");`);
    this.addSql(`alter table "food_aliases" add constraint "food_aliases_household_id_name_unique" unique ("household_id", "name");`);

    this.addSql(`alter table "recipe_ingredients" add "food_key" varchar(255) null, add "food_source" varchar(255) null;`);

    this.addSql(`alter table "food_aliases" add constraint "food_aliases_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "food_aliases" cascade;`);

    this.addSql(`alter table "recipe_ingredients" drop column "food_key", drop column "food_source";`);
  }

}
