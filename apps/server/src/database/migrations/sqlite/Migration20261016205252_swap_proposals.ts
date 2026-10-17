import { Migration } from '@mikro-orm/migrations';

export class Migration20261016205252_swap_proposals extends Migration {

  override name = 'Migration20261016205252_swap_proposals';

  override up(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`recipe_ingredients__temp_alter\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`position\` integer not null, \`section\` text null, \`raw_text\` text not null, \`quantity\` double null, \`quantity_max\` double null, \`unit\` text null, \`food\` text null, \`note\` text null, \`mark\` text check (\`mark\` in ('needed', 'swappable', 'optional')) null, constraint \`recipe_ingredients_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_ingredients_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`recipe_ingredients__temp_alter\` select \`id\`, \`household_id\`, \`recipe_id\`, \`position\`, \`section\`, \`raw_text\`, \`quantity\`, \`quantity_max\`, \`unit\`, \`food\`, \`note\`, \`mark\` from \`recipe_ingredients\`;`);
    this.addSql(`drop table \`recipe_ingredients\`;`);
    this.addSql(`alter table \`recipe_ingredients__temp_alter\` rename to \`recipe_ingredients\`;`);
    this.addSql(`create index \`recipe_ingredients_household_id_index\` on \`recipe_ingredients\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_ingredients_recipe_id_index\` on \`recipe_ingredients\` (\`recipe_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`proposals__temp_alter\` (\`id\` text not null primary key, \`household_id\` text not null, \`kind\` text check (\`kind\` in ('tidy', 'note', 'edit', 'recipe', 'meals', 'list', 'tastes', 'import', 'swap')) not null, \`recipe_id\` text null, \`status\` text check (\`status\` in ('pending', 'applied', 'dismissed')) not null, \`summary\` text not null, \`note\` text null, \`payload\` json null, \`chat\` text null, \`before\` json not null, \`after\` json not null, \`job\` text null, \`created_by_id\` text null, \`created_at\` datetime not null, \`resolved_by_id\` text null, \`resolved_at\` datetime null, constraint \`proposals_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`proposals_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`proposals_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null, constraint \`proposals_resolved_by_id_foreign\` foreign key (\`resolved_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`proposals__temp_alter\` select \`id\`, \`household_id\`, \`kind\`, \`recipe_id\`, \`status\`, \`summary\`, \`note\`, \`payload\`, \`chat\`, \`before\`, \`after\`, \`job\`, \`created_by_id\`, \`created_at\`, \`resolved_by_id\`, \`resolved_at\` from \`proposals\`;`);
    this.addSql(`drop table \`proposals\`;`);
    this.addSql(`alter table \`proposals__temp_alter\` rename to \`proposals\`;`);
    this.addSql(`create index \`proposals_household_id_index\` on \`proposals\` (\`household_id\`);`);
    this.addSql(`create index \`proposals_recipe_id_index\` on \`proposals\` (\`recipe_id\`);`);
    this.addSql(`create index \`proposals_chat_index\` on \`proposals\` (\`chat\`);`);
    this.addSql(`create index \`proposals_created_by_id_index\` on \`proposals\` (\`created_by_id\`);`);
    this.addSql(`create index \`proposals_resolved_by_id_index\` on \`proposals\` (\`resolved_by_id\`);`);
    this.addSql(`create index \`proposals_household_id_status_index\` on \`proposals\` (\`household_id\`, \`status\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`proposals__temp_alter\` (\`after\` json not null, \`before\` json not null, \`chat\` text null, \`created_at\` datetime not null, \`created_by_id\` text null, \`household_id\` text not null, \`id\` text not null primary key, \`job\` text null, \`kind\` text check (\`kind\` in ('tidy', 'note', 'edit', 'recipe', 'meals', 'list', 'tastes', 'import')) not null, \`note\` text null, \`payload\` json null, \`recipe_id\` text null, \`resolved_at\` datetime null, \`resolved_by_id\` text null, \`status\` text check (\`status\` in ('pending', 'applied', 'dismissed')) not null, \`summary\` text not null, constraint \`proposals_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null, constraint \`proposals_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`proposals_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`proposals_resolved_by_id_foreign\` foreign key (\`resolved_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`proposals__temp_alter\` select \`after\`, \`before\`, \`chat\`, \`created_at\`, \`created_by_id\`, \`household_id\`, \`id\`, \`job\`, \`kind\`, \`note\`, \`payload\`, \`recipe_id\`, \`resolved_at\`, \`resolved_by_id\`, \`status\`, \`summary\` from \`proposals\`;`);
    this.addSql(`drop table \`proposals\`;`);
    this.addSql(`alter table \`proposals__temp_alter\` rename to \`proposals\`;`);
    this.addSql(`create index \`proposals_chat_index\` on \`proposals\` (\`chat\`);`);
    this.addSql(`create index \`proposals_created_by_id_index\` on \`proposals\` (\`created_by_id\`);`);
    this.addSql(`create index \`proposals_household_id_index\` on \`proposals\` (\`household_id\`);`);
    this.addSql(`create index \`proposals_household_id_status_index\` on \`proposals\` (\`household_id\`, \`status\`);`);
    this.addSql(`create index \`proposals_recipe_id_index\` on \`proposals\` (\`recipe_id\`);`);
    this.addSql(`create index \`proposals_resolved_by_id_index\` on \`proposals\` (\`resolved_by_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`recipe_ingredients__temp_alter\` (\`food\` text null, \`household_id\` text not null, \`id\` text not null primary key, \`mark\` text null, \`note\` text null, \`position\` integer not null, \`quantity\` double null, \`quantity_max\` double null, \`raw_text\` text not null, \`recipe_id\` text not null, \`section\` text null, \`unit\` text null, constraint \`recipe_ingredients_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_ingredients_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`recipe_ingredients__temp_alter\` select \`food\`, \`household_id\`, \`id\`, \`mark\`, \`note\`, \`position\`, \`quantity\`, \`quantity_max\`, \`raw_text\`, \`recipe_id\`, \`section\`, \`unit\` from \`recipe_ingredients\`;`);
    this.addSql(`drop table \`recipe_ingredients\`;`);
    this.addSql(`alter table \`recipe_ingredients__temp_alter\` rename to \`recipe_ingredients\`;`);
    this.addSql(`create index \`recipe_ingredients_household_id_index\` on \`recipe_ingredients\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_ingredients_recipe_id_index\` on \`recipe_ingredients\` (\`recipe_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

}
