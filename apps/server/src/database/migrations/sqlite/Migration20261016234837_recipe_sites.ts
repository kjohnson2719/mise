import { Migration } from '@mikro-orm/migrations';

export class Migration20261016234837_recipe_sites extends Migration {

  override name = 'Migration20261016234837_recipe_sites';

  override up(): void | Promise<void> {
    this.addSql(`create table \`recipe_sites\` (\`id\` text not null primary key, \`name\` text not null, \`url\` text not null, \`feed_url\` text not null, \`language\` text null, \`etag\` text null, \`last_modified\` text null, \`read_at\` datetime null, \`next_read_at\` datetime not null, \`error\` text null, \`created_at\` datetime not null);`);
    this.addSql(`create unique index \`recipe_sites_feed_url_unique\` on \`recipe_sites\` (\`feed_url\`);`);
    this.addSql(`create index \`recipe_sites_next_read_at_index\` on \`recipe_sites\` (\`next_read_at\`);`);

    this.addSql(`create table \`followed_sites\` (\`id\` text not null primary key, \`household_id\` text not null, \`site_id\` text not null, \`created_at\` datetime not null, constraint \`followed_sites_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`followed_sites_site_id_foreign\` foreign key (\`site_id\`) references \`recipe_sites\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`followed_sites_household_id_index\` on \`followed_sites\` (\`household_id\`);`);
    this.addSql(`create index \`followed_sites_site_id_index\` on \`followed_sites\` (\`site_id\`);`);
    this.addSql(`create unique index \`followed_sites_household_id_site_id_unique\` on \`followed_sites\` (\`household_id\`, \`site_id\`);`);

    this.addSql(`create table \`site_recipes\` (\`id\` text not null primary key, \`site_id\` text null, \`url\` text not null, \`state\` text check (\`state\` in ('waiting', 'recipe', 'not-recipe', 'failed')) not null, \`site_name\` text not null, \`name\` text null, \`description\` text null, \`minutes\` integer null, \`photo_url\` text null, \`photo\` text null, \`courses\` json not null, \`keywords\` json not null, \`ingredients\` json not null, \`diets\` json not null, \`published_at\` datetime null, \`opened_at\` datetime null, \`failures\` integer not null default 0, \`classic\` integer not null default false, \`created_at\` datetime not null, constraint \`site_recipes_site_id_foreign\` foreign key (\`site_id\`) references \`recipe_sites\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`site_recipes_site_id_index\` on \`site_recipes\` (\`site_id\`);`);
    this.addSql(`create unique index \`site_recipes_url_unique\` on \`site_recipes\` (\`url\`);`);
    this.addSql(`create index \`site_recipes_site_id_state_index\` on \`site_recipes\` (\`site_id\`, \`state\`);`);
    this.addSql(`create index \`site_recipes_state_published_at_index\` on \`site_recipes\` (\`state\`, \`published_at\`);`);

    this.addSql(`alter table \`discoveries\` add column \`collection\` text null;`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`recipe_sites\`;`);
    this.addSql(`drop table if exists \`followed_sites\`;`);
    this.addSql(`drop table if exists \`site_recipes\`;`);

    this.addSql(`alter table \`discoveries\` drop column \`collection\`;`);
  }

}
