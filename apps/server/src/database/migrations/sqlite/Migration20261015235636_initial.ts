import { Migration } from '@mikro-orm/migrations';

export class Migration20261015235636_initial extends Migration {

  override name = 'Migration20261015235636_initial';

  override up(): void | Promise<void> {
    this.addSql(`create table \`households\` (\`id\` text not null primary key, \`name\` text not null, \`slug\` text not null, \`logo\` text null, \`metadata\` text null, \`created_at\` datetime not null, \`country\` text null, \`currency\` text null, \`time_zone\` text not null default 'UTC', \`week_starts_on\` integer not null default 1, \`settings\` json null);`);
    this.addSql(`create unique index \`households_slug_unique\` on \`households\` (\`slug\`);`);

    this.addSql(`create table \`aisles\` (\`id\` text not null primary key, \`household_id\` text not null, \`name\` text not null, \`position\` integer not null, \`key\` text null, constraint \`aisles_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`aisles_household_id_index\` on \`aisles\` (\`household_id\`);`);

    this.addSql(`create table \`pantry_items\` (\`id\` text not null primary key, \`household_id\` text not null, \`food_key\` text not null, \`name\` text not null, \`quantity\` double null, \`unit\` text null, \`amount_text\` text null, \`aisle_id\` text null, \`stored_in\` text check (\`stored_in\` in ('fridge', 'freezer', 'cupboard')) null, \`use_by\` text null, \`for_meals\` json null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`pantry_items_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`pantry_items_aisle_id_foreign\` foreign key (\`aisle_id\`) references \`aisles\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`pantry_items_household_id_index\` on \`pantry_items\` (\`household_id\`);`);
    this.addSql(`create index \`pantry_items_aisle_id_index\` on \`pantry_items\` (\`aisle_id\`);`);
    this.addSql(`create index \`pantry_items_household_id_food_key_index\` on \`pantry_items\` (\`household_id\`, \`food_key\`);`);

    this.addSql(`create table \`purchases\` (\`id\` text not null primary key, \`household_id\` text not null, \`food_key\` text not null, \`name\` text not null, \`quantity\` double null, \`unit\` text null, \`amount_text\` text null, \`bought_on\` text not null, \`created_at\` datetime not null, constraint \`purchases_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`purchases_household_id_index\` on \`purchases\` (\`household_id\`);`);
    this.addSql(`create index \`purchases_household_id_food_key_index\` on \`purchases\` (\`household_id\`, \`food_key\`);`);

    this.addSql(`create table \`shopping_lists\` (\`id\` text not null primary key, \`household_id\` text not null, \`name\` text not null, \`store\` text null, \`main\` integer not null default false, \`position\` integer not null default 0, \`aisles\` json null, \`created_at\` datetime not null, constraint \`shopping_lists_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`shopping_lists_household_id_index\` on \`shopping_lists\` (\`household_id\`);`);

    this.addSql(`create table \`shopping_items\` (\`id\` text not null primary key, \`household_id\` text not null, \`list_id\` text not null, \`food_key\` text null, \`name\` text not null, \`quantity\` double null, \`unit\` text null, \`amount_text\` text null, \`aisle_id\` text null, \`checked\` integer not null default false, \`checked_at\` datetime null, \`source\` text check (\`source\` in ('plan', 'typed', 'every-week', 'usual', 'assistant')) not null, \`for_meals\` json null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`shopping_items_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`shopping_items_list_id_foreign\` foreign key (\`list_id\`) references \`shopping_lists\` (\`id\`) on delete cascade, constraint \`shopping_items_aisle_id_foreign\` foreign key (\`aisle_id\`) references \`aisles\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`shopping_items_household_id_index\` on \`shopping_items\` (\`household_id\`);`);
    this.addSql(`create index \`shopping_items_list_id_index\` on \`shopping_items\` (\`list_id\`);`);
    this.addSql(`create index \`shopping_items_aisle_id_index\` on \`shopping_items\` (\`aisle_id\`);`);

    this.addSql(`create table \`food_placements\` (\`id\` text not null primary key, \`household_id\` text not null, \`food_key\` text not null, \`aisle_id\` text null, \`list_id\` text null, \`updated_at\` datetime not null, constraint \`food_placements_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`food_placements_aisle_id_foreign\` foreign key (\`aisle_id\`) references \`aisles\` (\`id\`) on delete set null, constraint \`food_placements_list_id_foreign\` foreign key (\`list_id\`) references \`shopping_lists\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`food_placements_household_id_index\` on \`food_placements\` (\`household_id\`);`);
    this.addSql(`create index \`food_placements_aisle_id_index\` on \`food_placements\` (\`aisle_id\`);`);
    this.addSql(`create index \`food_placements_list_id_index\` on \`food_placements\` (\`list_id\`);`);
    this.addSql(`create unique index \`food_placements_household_id_food_key_unique\` on \`food_placements\` (\`household_id\`, \`food_key\`);`);

    this.addSql(`create table \`tags\` (\`id\` text not null primary key, \`household_id\` text not null, \`name\` text not null, \`name_key\` text not null, constraint \`tags_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`tags_household_id_index\` on \`tags\` (\`household_id\`);`);
    this.addSql(`create unique index \`tags_household_id_name_key_unique\` on \`tags\` (\`household_id\`, \`name_key\`);`);

    this.addSql(`create table \`users\` (\`id\` text not null primary key, \`name\` text not null, \`email\` text not null, \`email_verified\` integer not null default false, \`image\` text null, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`username\` text null, \`display_username\` text null, \`role\` text null, \`banned\` integer null default false, \`ban_reason\` text null, \`ban_expires\` datetime null, \`preferences\` json null);`);
    this.addSql(`create unique index \`users_email_unique\` on \`users\` (\`email\`);`);
    this.addSql(`create unique index \`users_username_unique\` on \`users\` (\`username\`);`);

    this.addSql(`create table \`sessions\` (\`id\` text not null primary key, \`expires_at\` datetime not null, \`token\` text not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`ip_address\` text null, \`user_agent\` text null, \`user_id\` text not null, \`active_household_id\` text null, \`impersonated_by\` text null, constraint \`sessions_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade, constraint \`sessions_active_household_id_foreign\` foreign key (\`active_household_id\`) references \`households\` (\`id\`) on delete set null);`);
    this.addSql(`create unique index \`sessions_token_unique\` on \`sessions\` (\`token\`);`);
    this.addSql(`create index \`sessions_user_id_index\` on \`sessions\` (\`user_id\`);`);
    this.addSql(`create index \`sessions_active_household_id_index\` on \`sessions\` (\`active_household_id\`);`);

    this.addSql(`create table \`recipes\` (\`id\` text not null primary key, \`household_id\` text not null, \`slug\` text not null, \`name\` text not null, \`description\` text null, \`image\` text null, \`image_by_ai\` integer not null default false, \`source_url\` text null, \`servings\` double null, \`yield_text\` text null, \`prep_minutes\` integer null, \`cook_minutes\` integer null, \`total_minutes\` integer null, \`notes\` text null, \`rating\` integer null, \`nutrition\` json null, \`diet_overrides\` json null, \`origin\` text check (\`origin\` in ('link', 'video', 'text', 'photo', 'manual', 'assistant', 'mealie', 'paprika', 'merran')) not null, \`last_made_at\` datetime null, \`deleted_at\` datetime null, \`created_by_id\` text null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`recipes_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipes_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`recipes_household_id_index\` on \`recipes\` (\`household_id\`);`);
    this.addSql(`create index \`recipes_deleted_at_index\` on \`recipes\` (\`deleted_at\`);`);
    this.addSql(`create index \`recipes_created_by_id_index\` on \`recipes\` (\`created_by_id\`);`);
    this.addSql(`create index \`recipes_household_id_source_url_index\` on \`recipes\` (\`household_id\`, \`source_url\`);`);
    this.addSql(`create unique index \`recipes_household_id_slug_unique\` on \`recipes\` (\`household_id\`, \`slug\`);`);

    this.addSql(`create table \`recipe_versions\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`snapshot\` json not null, \`source\` text check (\`source\` in ('import', 'edit', 'tidy', 'assistant', 'swap', 'restore')) not null, \`created_by_id\` text null, \`created_at\` datetime not null, constraint \`recipe_versions_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_versions_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`recipe_versions_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`recipe_versions_household_id_index\` on \`recipe_versions\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_versions_recipe_id_index\` on \`recipe_versions\` (\`recipe_id\`);`);
    this.addSql(`create index \`recipe_versions_created_by_id_index\` on \`recipe_versions\` (\`created_by_id\`);`);

    this.addSql(`create table \`recipe_tags\` (\`recipe_id\` text not null, \`tag_id\` text not null, \`household_id\` text not null, primary key (\`recipe_id\`, \`tag_id\`), constraint \`recipe_tags_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on update cascade on delete cascade, constraint \`recipe_tags_tag_id_foreign\` foreign key (\`tag_id\`) references \`tags\` (\`id\`) on update cascade on delete cascade, constraint \`recipe_tags_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`recipe_tags_recipe_id_index\` on \`recipe_tags\` (\`recipe_id\`);`);
    this.addSql(`create index \`recipe_tags_tag_id_index\` on \`recipe_tags\` (\`tag_id\`);`);
    this.addSql(`create index \`recipe_tags_household_id_index\` on \`recipe_tags\` (\`household_id\`);`);

    this.addSql(`create table \`recipe_steps\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`position\` integer not null, \`section\` text null, \`text\` text not null, constraint \`recipe_steps_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_steps_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`recipe_steps_household_id_index\` on \`recipe_steps\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_steps_recipe_id_index\` on \`recipe_steps\` (\`recipe_id\`);`);

    this.addSql(`create table \`recipe_pairings\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`paired_recipe_id\` text null, \`tag_key\` text null, \`created_at\` datetime not null, constraint \`recipe_pairings_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_pairings_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`recipe_pairings_paired_recipe_id_foreign\` foreign key (\`paired_recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`recipe_pairings_household_id_index\` on \`recipe_pairings\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_pairings_recipe_id_index\` on \`recipe_pairings\` (\`recipe_id\`);`);
    this.addSql(`create index \`recipe_pairings_paired_recipe_id_index\` on \`recipe_pairings\` (\`paired_recipe_id\`);`);

    this.addSql(`create table \`recipe_ingredients\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`position\` integer not null, \`section\` text null, \`raw_text\` text not null, \`quantity\` double null, \`quantity_max\` double null, \`unit\` text null, \`food\` text null, \`note\` text null, constraint \`recipe_ingredients_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_ingredients_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`recipe_ingredients_household_id_index\` on \`recipe_ingredients\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_ingredients_recipe_id_index\` on \`recipe_ingredients\` (\`recipe_id\`);`);

    this.addSql(`create table \`plan_entries\` (\`id\` text not null primary key, \`household_id\` text not null, \`date\` text not null, \`any_day\` integer not null default false, \`meal\` text check (\`meal\` in ('breakfast', 'lunch', 'dinner', 'snack')) not null, \`position\` integer not null default 0, \`recipe_id\` text null, \`with_recipe_id\` text null, \`note\` text null, \`servings\` double null, \`status\` text check (\`status\` in ('planned', 'cooked', 'skipped')) not null default 'planned', \`listed_at\` datetime null, \`pantry_used\` json null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`plan_entries_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`plan_entries_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`plan_entries_with_recipe_id_foreign\` foreign key (\`with_recipe_id\`) references \`recipes\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`plan_entries_household_id_index\` on \`plan_entries\` (\`household_id\`);`);
    this.addSql(`create index \`plan_entries_recipe_id_index\` on \`plan_entries\` (\`recipe_id\`);`);
    this.addSql(`create index \`plan_entries_with_recipe_id_index\` on \`plan_entries\` (\`with_recipe_id\`);`);
    this.addSql(`create index \`plan_entries_household_id_date_index\` on \`plan_entries\` (\`household_id\`, \`date\`);`);

    this.addSql(`create table \`household_members\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text not null, \`role\` text check (\`role\` in ('owner', 'admin', 'member')) not null default 'member', \`created_at\` datetime not null, constraint \`household_members_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`household_members_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`household_members_household_id_index\` on \`household_members\` (\`household_id\`);`);
    this.addSql(`create index \`household_members_user_id_index\` on \`household_members\` (\`user_id\`);`);
    this.addSql(`create unique index \`household_members_household_id_user_id_unique\` on \`household_members\` (\`household_id\`, \`user_id\`);`);

    this.addSql(`create table \`cook_notes\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`user_id\` text null, \`rating\` integer null, \`note\` text null, \`created_at\` datetime not null, constraint \`cook_notes_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`cook_notes_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`cook_notes_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`cook_notes_household_id_index\` on \`cook_notes\` (\`household_id\`);`);
    this.addSql(`create index \`cook_notes_recipe_id_index\` on \`cook_notes\` (\`recipe_id\`);`);
    this.addSql(`create index \`cook_notes_user_id_index\` on \`cook_notes\` (\`user_id\`);`);

    this.addSql(`create table \`accounts\` (\`id\` text not null primary key, \`account_id\` text not null, \`provider_id\` text not null, \`user_id\` text not null, \`access_token\` text null, \`refresh_token\` text null, \`id_token\` text null, \`access_token_expires_at\` datetime null, \`refresh_token_expires_at\` datetime null, \`scope\` text null, \`password\` text null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`accounts_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`accounts_user_id_index\` on \`accounts\` (\`user_id\`);`);

    this.addSql(`create table \`verifications\` (\`id\` text not null primary key, \`identifier\` text not null, \`value\` text not null, \`expires_at\` datetime not null, \`created_at\` datetime not null, \`updated_at\` datetime not null);`);
    this.addSql(`create index \`verifications_identifier_index\` on \`verifications\` (\`identifier\`);`);

    this.addSql(`create table \`weekly_items\` (\`id\` text not null primary key, \`household_id\` text not null, \`name\` text not null, \`amount_text\` text null, \`aisle_id\` text null, \`list_id\` text null, \`position\` integer not null default 0, constraint \`weekly_items_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`weekly_items_aisle_id_foreign\` foreign key (\`aisle_id\`) references \`aisles\` (\`id\`) on delete set null, constraint \`weekly_items_list_id_foreign\` foreign key (\`list_id\`) references \`shopping_lists\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`weekly_items_household_id_index\` on \`weekly_items\` (\`household_id\`);`);
    this.addSql(`create index \`weekly_items_aisle_id_index\` on \`weekly_items\` (\`aisle_id\`);`);
    this.addSql(`create index \`weekly_items_list_id_index\` on \`weekly_items\` (\`list_id\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`households\`;`);
    this.addSql(`drop table if exists \`aisles\`;`);
    this.addSql(`drop table if exists \`pantry_items\`;`);
    this.addSql(`drop table if exists \`purchases\`;`);
    this.addSql(`drop table if exists \`shopping_lists\`;`);
    this.addSql(`drop table if exists \`shopping_items\`;`);
    this.addSql(`drop table if exists \`food_placements\`;`);
    this.addSql(`drop table if exists \`tags\`;`);
    this.addSql(`drop table if exists \`users\`;`);
    this.addSql(`drop table if exists \`sessions\`;`);
    this.addSql(`drop table if exists \`recipes\`;`);
    this.addSql(`drop table if exists \`recipe_versions\`;`);
    this.addSql(`drop table if exists \`recipe_tags\`;`);
    this.addSql(`drop table if exists \`recipe_steps\`;`);
    this.addSql(`drop table if exists \`recipe_pairings\`;`);
    this.addSql(`drop table if exists \`recipe_ingredients\`;`);
    this.addSql(`drop table if exists \`plan_entries\`;`);
    this.addSql(`drop table if exists \`household_members\`;`);
    this.addSql(`drop table if exists \`cook_notes\`;`);
    this.addSql(`drop table if exists \`accounts\`;`);
    this.addSql(`drop table if exists \`verifications\`;`);
    this.addSql(`drop table if exists \`weekly_items\`;`);
  }

}
