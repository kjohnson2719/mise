import { Migration } from '@mikro-orm/migrations';

export class Migration20261016234838_recipe_sites extends Migration {

  override name = 'Migration20261016234838_recipe_sites';

  override up(): void | Promise<void> {
    this.addSql(`create table "recipe_sites" ("id" uuid not null, "name" varchar(255) not null, "url" text not null, "feed_url" text not null, "language" varchar(255) null, "etag" text null, "last_modified" text null, "read_at" timestamptz null, "next_read_at" timestamptz not null, "error" text null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "recipe_sites" add constraint "recipe_sites_feed_url_unique" unique ("feed_url");`);
    this.addSql(`create index "recipe_sites_next_read_at_index" on "recipe_sites" ("next_read_at");`);

    this.addSql(`create table "followed_sites" ("id" uuid not null, "household_id" uuid not null, "site_id" uuid not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "followed_sites_household_id_index" on "followed_sites" ("household_id");`);
    this.addSql(`alter table "followed_sites" add constraint "followed_sites_household_id_site_id_unique" unique ("household_id", "site_id");`);

    this.addSql(`create table "site_recipes" ("id" uuid not null, "site_id" uuid null, "url" text not null, "state" text not null, "site_name" varchar(255) not null, "name" text null, "description" text null, "minutes" int null, "photo_url" text null, "photo" varchar(255) null, "courses" jsonb not null, "keywords" jsonb not null, "ingredients" jsonb not null, "diets" jsonb not null, "published_at" timestamptz null, "opened_at" timestamptz null, "failures" int not null default 0, "classic" boolean not null default false, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "site_recipes" add constraint "site_recipes_url_unique" unique ("url");`);
    this.addSql(`create index "site_recipes_site_id_state_index" on "site_recipes" ("site_id", "state");`);
    this.addSql(`create index "site_recipes_state_published_at_index" on "site_recipes" ("state", "published_at");`);

    this.addSql(`alter table "discoveries" add "collection" varchar(255) null;`);

    this.addSql(`alter table "followed_sites" add constraint "followed_sites_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "followed_sites" add constraint "followed_sites_site_id_foreign" foreign key ("site_id") references "recipe_sites" ("id") on delete cascade;`);

    this.addSql(`alter table "site_recipes" add constraint "site_recipes_site_id_foreign" foreign key ("site_id") references "recipe_sites" ("id") on delete cascade;`);
    this.addSql(`alter table "site_recipes" add constraint "site_recipes_state_check" check ("state" in ('waiting', 'recipe', 'not-recipe', 'failed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "followed_sites" drop constraint "followed_sites_site_id_foreign";`);
    this.addSql(`alter table "site_recipes" drop constraint "site_recipes_site_id_foreign";`);

    this.addSql(`drop table if exists "recipe_sites" cascade;`);
    this.addSql(`drop table if exists "followed_sites" cascade;`);
    this.addSql(`drop table if exists "site_recipes" cascade;`);

    this.addSql(`alter table "discoveries" drop column "collection";`);
  }

}
