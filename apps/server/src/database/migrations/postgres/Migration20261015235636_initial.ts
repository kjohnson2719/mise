import { Migration } from '@mikro-orm/migrations';

export class Migration20261015235636_initial extends Migration {

  override name = 'Migration20261015235636_initial';

  override up(): void | Promise<void> {
    this.addSql(`create table "households" ("id" uuid not null, "name" varchar(255) not null, "slug" varchar(255) not null, "logo" varchar(255) null, "metadata" text null, "created_at" timestamptz not null, "country" varchar(2) null, "currency" varchar(3) null, "time_zone" varchar(255) not null default 'UTC', "week_starts_on" smallint not null default 1, "settings" jsonb null, primary key ("id"));`);
    this.addSql(`alter table "households" add constraint "households_slug_unique" unique ("slug");`);

    this.addSql(`create table "aisles" ("id" uuid not null, "household_id" uuid not null, "name" varchar(255) not null, "position" int not null, "key" varchar(255) null, primary key ("id"));`);
    this.addSql(`create index "aisles_household_id_index" on "aisles" ("household_id");`);

    this.addSql(`create table "pantry_items" ("id" uuid not null, "household_id" uuid not null, "food_key" varchar(255) not null, "name" varchar(255) not null, "quantity" double precision null, "unit" varchar(255) null, "amount_text" varchar(255) null, "aisle_id" uuid null, "stored_in" text null, "use_by" varchar(10) null, "for_meals" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "pantry_items_household_id_index" on "pantry_items" ("household_id");`);
    this.addSql(`create index "pantry_items_household_id_food_key_index" on "pantry_items" ("household_id", "food_key");`);

    this.addSql(`create table "purchases" ("id" uuid not null, "household_id" uuid not null, "food_key" varchar(255) not null, "name" varchar(255) not null, "quantity" double precision null, "unit" varchar(255) null, "amount_text" varchar(255) null, "bought_on" varchar(10) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "purchases_household_id_index" on "purchases" ("household_id");`);
    this.addSql(`create index "purchases_household_id_food_key_index" on "purchases" ("household_id", "food_key");`);

    this.addSql(`create table "shopping_lists" ("id" uuid not null, "household_id" uuid not null, "name" varchar(255) not null, "store" varchar(255) null, "main" boolean not null default false, "position" int not null default 0, "aisles" jsonb null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "shopping_lists_household_id_index" on "shopping_lists" ("household_id");`);

    this.addSql(`create table "shopping_items" ("id" uuid not null, "household_id" uuid not null, "list_id" uuid not null, "food_key" varchar(255) null, "name" varchar(255) not null, "quantity" double precision null, "unit" varchar(255) null, "amount_text" varchar(255) null, "aisle_id" uuid null, "checked" boolean not null default false, "checked_at" timestamptz null, "source" text not null, "for_meals" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "shopping_items_household_id_index" on "shopping_items" ("household_id");`);
    this.addSql(`create index "shopping_items_list_id_index" on "shopping_items" ("list_id");`);

    this.addSql(`create table "food_placements" ("id" uuid not null, "household_id" uuid not null, "food_key" varchar(255) not null, "aisle_id" uuid null, "list_id" uuid null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "food_placements_household_id_index" on "food_placements" ("household_id");`);
    this.addSql(`alter table "food_placements" add constraint "food_placements_household_id_food_key_unique" unique ("household_id", "food_key");`);

    this.addSql(`create table "tags" ("id" uuid not null, "household_id" uuid not null, "name" varchar(255) not null, "name_key" varchar(255) not null, primary key ("id"));`);
    this.addSql(`create index "tags_household_id_index" on "tags" ("household_id");`);
    this.addSql(`alter table "tags" add constraint "tags_household_id_name_key_unique" unique ("household_id", "name_key");`);

    this.addSql(`create table "users" ("id" uuid not null, "name" varchar(255) not null, "email" varchar(255) not null, "email_verified" boolean not null default false, "image" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "username" varchar(255) null, "display_username" varchar(255) null, "role" varchar(255) null, "banned" boolean null default false, "ban_reason" varchar(255) null, "ban_expires" timestamptz null, "preferences" jsonb null, primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);
    this.addSql(`alter table "users" add constraint "users_username_unique" unique ("username");`);

    this.addSql(`create table "sessions" ("id" uuid not null, "expires_at" timestamptz not null, "token" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "ip_address" varchar(255) null, "user_agent" text null, "user_id" uuid not null, "active_household_id" uuid null, "impersonated_by" varchar(255) null, primary key ("id"));`);
    this.addSql(`alter table "sessions" add constraint "sessions_token_unique" unique ("token");`);
    this.addSql(`create index "sessions_user_id_index" on "sessions" ("user_id");`);

    this.addSql(`create table "recipes" ("id" uuid not null, "household_id" uuid not null, "slug" varchar(255) not null, "name" varchar(255) not null, "description" text null, "image" varchar(255) null, "image_by_ai" boolean not null default false, "source_url" text null, "servings" double precision null, "yield_text" varchar(255) null, "prep_minutes" int null, "cook_minutes" int null, "total_minutes" int null, "notes" text null, "rating" smallint null, "nutrition" jsonb null, "diet_overrides" jsonb null, "origin" text not null, "last_made_at" timestamptz null, "deleted_at" timestamptz null, "created_by_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "recipes_household_id_index" on "recipes" ("household_id");`);
    this.addSql(`create index "recipes_deleted_at_index" on "recipes" ("deleted_at");`);
    this.addSql(`create index "recipes_household_id_source_url_index" on "recipes" ("household_id", "source_url");`);
    this.addSql(`alter table "recipes" add constraint "recipes_household_id_slug_unique" unique ("household_id", "slug");`);

    this.addSql(`create table "recipe_versions" ("id" uuid not null, "household_id" uuid not null, "recipe_id" uuid not null, "snapshot" jsonb not null, "source" text not null, "created_by_id" uuid null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "recipe_versions_household_id_index" on "recipe_versions" ("household_id");`);
    this.addSql(`create index "recipe_versions_recipe_id_index" on "recipe_versions" ("recipe_id");`);

    this.addSql(`create table "recipe_tags" ("recipe_id" uuid not null, "tag_id" uuid not null, "household_id" uuid not null, primary key ("recipe_id", "tag_id"));`);
    this.addSql(`create index "recipe_tags_tag_id_index" on "recipe_tags" ("tag_id");`);
    this.addSql(`create index "recipe_tags_household_id_index" on "recipe_tags" ("household_id");`);

    this.addSql(`create table "recipe_steps" ("id" uuid not null, "household_id" uuid not null, "recipe_id" uuid not null, "position" int not null, "section" varchar(255) null, "text" text not null, primary key ("id"));`);
    this.addSql(`create index "recipe_steps_household_id_index" on "recipe_steps" ("household_id");`);
    this.addSql(`create index "recipe_steps_recipe_id_index" on "recipe_steps" ("recipe_id");`);

    this.addSql(`create table "recipe_pairings" ("id" uuid not null, "household_id" uuid not null, "recipe_id" uuid not null, "paired_recipe_id" uuid null, "tag_key" varchar(255) null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "recipe_pairings_household_id_index" on "recipe_pairings" ("household_id");`);
    this.addSql(`create index "recipe_pairings_recipe_id_index" on "recipe_pairings" ("recipe_id");`);

    this.addSql(`create table "recipe_ingredients" ("id" uuid not null, "household_id" uuid not null, "recipe_id" uuid not null, "position" int not null, "section" varchar(255) null, "raw_text" text not null, "quantity" double precision null, "quantity_max" double precision null, "unit" varchar(255) null, "food" varchar(255) null, "note" text null, primary key ("id"));`);
    this.addSql(`create index "recipe_ingredients_household_id_index" on "recipe_ingredients" ("household_id");`);
    this.addSql(`create index "recipe_ingredients_recipe_id_index" on "recipe_ingredients" ("recipe_id");`);

    this.addSql(`create table "plan_entries" ("id" uuid not null, "household_id" uuid not null, "date" varchar(10) not null, "any_day" boolean not null default false, "meal" text not null, "position" int not null default 0, "recipe_id" uuid null, "with_recipe_id" uuid null, "note" text null, "servings" double precision null, "status" text not null default 'planned', "listed_at" timestamptz null, "pantry_used" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "plan_entries_household_id_index" on "plan_entries" ("household_id");`);
    this.addSql(`create index "plan_entries_household_id_date_index" on "plan_entries" ("household_id", "date");`);

    this.addSql(`create table "household_members" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid not null, "role" text not null default 'member', "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "household_members_household_id_index" on "household_members" ("household_id");`);
    this.addSql(`create index "household_members_user_id_index" on "household_members" ("user_id");`);
    this.addSql(`alter table "household_members" add constraint "household_members_household_id_user_id_unique" unique ("household_id", "user_id");`);

    this.addSql(`create table "cook_notes" ("id" uuid not null, "household_id" uuid not null, "recipe_id" uuid not null, "user_id" uuid null, "rating" smallint null, "note" text null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cook_notes_household_id_index" on "cook_notes" ("household_id");`);
    this.addSql(`create index "cook_notes_recipe_id_index" on "cook_notes" ("recipe_id");`);

    this.addSql(`create table "accounts" ("id" uuid not null, "account_id" varchar(255) not null, "provider_id" varchar(255) not null, "user_id" uuid not null, "access_token" text null, "refresh_token" text null, "id_token" text null, "access_token_expires_at" timestamptz null, "refresh_token_expires_at" timestamptz null, "scope" varchar(255) null, "password" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "accounts_user_id_index" on "accounts" ("user_id");`);

    this.addSql(`create table "verifications" ("id" uuid not null, "identifier" varchar(255) not null, "value" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "verifications_identifier_index" on "verifications" ("identifier");`);

    this.addSql(`create table "weekly_items" ("id" uuid not null, "household_id" uuid not null, "name" varchar(255) not null, "amount_text" varchar(255) null, "aisle_id" uuid null, "list_id" uuid null, "position" int not null default 0, primary key ("id"));`);
    this.addSql(`create index "weekly_items_household_id_index" on "weekly_items" ("household_id");`);

    this.addSql(`alter table "aisles" add constraint "aisles_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "pantry_items" add constraint "pantry_items_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "pantry_items" add constraint "pantry_items_aisle_id_foreign" foreign key ("aisle_id") references "aisles" ("id") on delete set null;`);
    this.addSql(`alter table "pantry_items" add constraint "pantry_items_stored_in_check" check ("stored_in" in ('fridge', 'freezer', 'cupboard'));`);

    this.addSql(`alter table "purchases" add constraint "purchases_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "shopping_lists" add constraint "shopping_lists_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "shopping_items" add constraint "shopping_items_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "shopping_items" add constraint "shopping_items_list_id_foreign" foreign key ("list_id") references "shopping_lists" ("id") on delete cascade;`);
    this.addSql(`alter table "shopping_items" add constraint "shopping_items_aisle_id_foreign" foreign key ("aisle_id") references "aisles" ("id") on delete set null;`);
    this.addSql(`alter table "shopping_items" add constraint "shopping_items_source_check" check ("source" in ('plan', 'typed', 'every-week', 'usual', 'assistant'));`);

    this.addSql(`alter table "food_placements" add constraint "food_placements_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "food_placements" add constraint "food_placements_aisle_id_foreign" foreign key ("aisle_id") references "aisles" ("id") on delete set null;`);
    this.addSql(`alter table "food_placements" add constraint "food_placements_list_id_foreign" foreign key ("list_id") references "shopping_lists" ("id") on delete set null;`);

    this.addSql(`alter table "tags" add constraint "tags_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "sessions" add constraint "sessions_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
    this.addSql(`alter table "sessions" add constraint "sessions_active_household_id_foreign" foreign key ("active_household_id") references "households" ("id") on delete set null;`);

    this.addSql(`alter table "recipes" add constraint "recipes_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "recipes" add constraint "recipes_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "recipes" add constraint "recipes_origin_check" check ("origin" in ('link', 'video', 'text', 'photo', 'manual', 'assistant', 'mealie', 'paprika', 'merran'));`);

    this.addSql(`alter table "recipe_versions" add constraint "recipe_versions_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_versions" add constraint "recipe_versions_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_versions" add constraint "recipe_versions_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "recipe_versions" add constraint "recipe_versions_source_check" check ("source" in ('import', 'edit', 'tidy', 'assistant', 'swap', 'restore'));`);

    this.addSql(`alter table "recipe_tags" add constraint "recipe_tags_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "recipe_tags" add constraint "recipe_tags_tag_id_foreign" foreign key ("tag_id") references "tags" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "recipe_tags" add constraint "recipe_tags_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "recipe_steps" add constraint "recipe_steps_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_steps" add constraint "recipe_steps_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);

    this.addSql(`alter table "recipe_pairings" add constraint "recipe_pairings_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_pairings" add constraint "recipe_pairings_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_pairings" add constraint "recipe_pairings_paired_recipe_id_foreign" foreign key ("paired_recipe_id") references "recipes" ("id") on delete cascade;`);

    this.addSql(`alter table "recipe_ingredients" add constraint "recipe_ingredients_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_ingredients" add constraint "recipe_ingredients_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);

    this.addSql(`alter table "plan_entries" add constraint "plan_entries_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "plan_entries" add constraint "plan_entries_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "plan_entries" add constraint "plan_entries_with_recipe_id_foreign" foreign key ("with_recipe_id") references "recipes" ("id") on delete set null;`);
    this.addSql(`alter table "plan_entries" add constraint "plan_entries_meal_check" check ("meal" in ('breakfast', 'lunch', 'dinner', 'snack'));`);
    this.addSql(`alter table "plan_entries" add constraint "plan_entries_status_check" check ("status" in ('planned', 'cooked', 'skipped'));`);

    this.addSql(`alter table "household_members" add constraint "household_members_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "household_members" add constraint "household_members_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
    this.addSql(`alter table "household_members" add constraint "household_members_role_check" check ("role" in ('owner', 'admin', 'member'));`);

    this.addSql(`alter table "cook_notes" add constraint "cook_notes_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "cook_notes" add constraint "cook_notes_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "cook_notes" add constraint "cook_notes_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null;`);

    this.addSql(`alter table "accounts" add constraint "accounts_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);

    this.addSql(`alter table "weekly_items" add constraint "weekly_items_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "weekly_items" add constraint "weekly_items_aisle_id_foreign" foreign key ("aisle_id") references "aisles" ("id") on delete set null;`);
    this.addSql(`alter table "weekly_items" add constraint "weekly_items_list_id_foreign" foreign key ("list_id") references "shopping_lists" ("id") on delete set null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "aisles" drop constraint "aisles_household_id_foreign";`);
    this.addSql(`alter table "pantry_items" drop constraint "pantry_items_household_id_foreign";`);
    this.addSql(`alter table "purchases" drop constraint "purchases_household_id_foreign";`);
    this.addSql(`alter table "shopping_lists" drop constraint "shopping_lists_household_id_foreign";`);
    this.addSql(`alter table "shopping_items" drop constraint "shopping_items_household_id_foreign";`);
    this.addSql(`alter table "food_placements" drop constraint "food_placements_household_id_foreign";`);
    this.addSql(`alter table "tags" drop constraint "tags_household_id_foreign";`);
    this.addSql(`alter table "sessions" drop constraint "sessions_active_household_id_foreign";`);
    this.addSql(`alter table "recipes" drop constraint "recipes_household_id_foreign";`);
    this.addSql(`alter table "recipe_versions" drop constraint "recipe_versions_household_id_foreign";`);
    this.addSql(`alter table "recipe_tags" drop constraint "recipe_tags_household_id_foreign";`);
    this.addSql(`alter table "recipe_steps" drop constraint "recipe_steps_household_id_foreign";`);
    this.addSql(`alter table "recipe_pairings" drop constraint "recipe_pairings_household_id_foreign";`);
    this.addSql(`alter table "recipe_ingredients" drop constraint "recipe_ingredients_household_id_foreign";`);
    this.addSql(`alter table "plan_entries" drop constraint "plan_entries_household_id_foreign";`);
    this.addSql(`alter table "household_members" drop constraint "household_members_household_id_foreign";`);
    this.addSql(`alter table "cook_notes" drop constraint "cook_notes_household_id_foreign";`);
    this.addSql(`alter table "weekly_items" drop constraint "weekly_items_household_id_foreign";`);
    this.addSql(`alter table "pantry_items" drop constraint "pantry_items_aisle_id_foreign";`);
    this.addSql(`alter table "shopping_items" drop constraint "shopping_items_aisle_id_foreign";`);
    this.addSql(`alter table "food_placements" drop constraint "food_placements_aisle_id_foreign";`);
    this.addSql(`alter table "weekly_items" drop constraint "weekly_items_aisle_id_foreign";`);
    this.addSql(`alter table "shopping_items" drop constraint "shopping_items_list_id_foreign";`);
    this.addSql(`alter table "food_placements" drop constraint "food_placements_list_id_foreign";`);
    this.addSql(`alter table "weekly_items" drop constraint "weekly_items_list_id_foreign";`);
    this.addSql(`alter table "recipe_tags" drop constraint "recipe_tags_tag_id_foreign";`);
    this.addSql(`alter table "sessions" drop constraint "sessions_user_id_foreign";`);
    this.addSql(`alter table "recipes" drop constraint "recipes_created_by_id_foreign";`);
    this.addSql(`alter table "recipe_versions" drop constraint "recipe_versions_created_by_id_foreign";`);
    this.addSql(`alter table "household_members" drop constraint "household_members_user_id_foreign";`);
    this.addSql(`alter table "cook_notes" drop constraint "cook_notes_user_id_foreign";`);
    this.addSql(`alter table "accounts" drop constraint "accounts_user_id_foreign";`);
    this.addSql(`alter table "recipe_versions" drop constraint "recipe_versions_recipe_id_foreign";`);
    this.addSql(`alter table "recipe_tags" drop constraint "recipe_tags_recipe_id_foreign";`);
    this.addSql(`alter table "recipe_steps" drop constraint "recipe_steps_recipe_id_foreign";`);
    this.addSql(`alter table "recipe_pairings" drop constraint "recipe_pairings_recipe_id_foreign";`);
    this.addSql(`alter table "recipe_pairings" drop constraint "recipe_pairings_paired_recipe_id_foreign";`);
    this.addSql(`alter table "recipe_ingredients" drop constraint "recipe_ingredients_recipe_id_foreign";`);
    this.addSql(`alter table "plan_entries" drop constraint "plan_entries_recipe_id_foreign";`);
    this.addSql(`alter table "plan_entries" drop constraint "plan_entries_with_recipe_id_foreign";`);
    this.addSql(`alter table "cook_notes" drop constraint "cook_notes_recipe_id_foreign";`);

    this.addSql(`drop table if exists "households" cascade;`);
    this.addSql(`drop table if exists "aisles" cascade;`);
    this.addSql(`drop table if exists "pantry_items" cascade;`);
    this.addSql(`drop table if exists "purchases" cascade;`);
    this.addSql(`drop table if exists "shopping_lists" cascade;`);
    this.addSql(`drop table if exists "shopping_items" cascade;`);
    this.addSql(`drop table if exists "food_placements" cascade;`);
    this.addSql(`drop table if exists "tags" cascade;`);
    this.addSql(`drop table if exists "users" cascade;`);
    this.addSql(`drop table if exists "sessions" cascade;`);
    this.addSql(`drop table if exists "recipes" cascade;`);
    this.addSql(`drop table if exists "recipe_versions" cascade;`);
    this.addSql(`drop table if exists "recipe_tags" cascade;`);
    this.addSql(`drop table if exists "recipe_steps" cascade;`);
    this.addSql(`drop table if exists "recipe_pairings" cascade;`);
    this.addSql(`drop table if exists "recipe_ingredients" cascade;`);
    this.addSql(`drop table if exists "plan_entries" cascade;`);
    this.addSql(`drop table if exists "household_members" cascade;`);
    this.addSql(`drop table if exists "cook_notes" cascade;`);
    this.addSql(`drop table if exists "accounts" cascade;`);
    this.addSql(`drop table if exists "verifications" cascade;`);
    this.addSql(`drop table if exists "weekly_items" cascade;`);
  }

}
