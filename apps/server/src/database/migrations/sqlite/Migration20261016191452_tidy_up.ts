import { Migration } from '@mikro-orm/migrations';

export class Migration20261016191452_tidy_up extends Migration {

  override name = 'Migration20261016191452_tidy_up';

  override up(): void | Promise<void> {
    this.addSql(`create table \`proposals\` (\`id\` text not null primary key, \`household_id\` text not null, \`kind\` text check (\`kind\` in ('tidy')) not null, \`recipe_id\` text null, \`status\` text check (\`status\` in ('pending', 'applied', 'dismissed')) not null, \`summary\` text not null, \`before\` json not null, \`after\` json not null, \`job\` text null, \`created_by_id\` text null, \`created_at\` datetime not null, \`resolved_by_id\` text null, \`resolved_at\` datetime null, constraint \`proposals_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`proposals_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`proposals_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null, constraint \`proposals_resolved_by_id_foreign\` foreign key (\`resolved_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`proposals_household_id_index\` on \`proposals\` (\`household_id\`);`);
    this.addSql(`create index \`proposals_recipe_id_index\` on \`proposals\` (\`recipe_id\`);`);
    this.addSql(`create index \`proposals_created_by_id_index\` on \`proposals\` (\`created_by_id\`);`);
    this.addSql(`create index \`proposals_resolved_by_id_index\` on \`proposals\` (\`resolved_by_id\`);`);
    this.addSql(`create index \`proposals_household_id_status_index\` on \`proposals\` (\`household_id\`, \`status\`);`);

    this.addSql(`alter table \`recipes\` add column \`tidied_at\` datetime null;`);

    this.addSql(`alter table \`recipe_ingredients\` add column \`mark\` text check (\`mark\` in ('needed', 'swappable', 'optional')) null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`proposals\`;`);

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`recipe_ingredients__temp_alter\` (\`food\` text null, \`household_id\` text not null, \`id\` text not null primary key, \`note\` text null, \`position\` integer not null, \`quantity\` double null, \`quantity_max\` double null, \`raw_text\` text not null, \`recipe_id\` text not null, \`section\` text null, \`unit\` text null, constraint \`recipe_ingredients_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_ingredients_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`recipe_ingredients__temp_alter\` select \`food\`, \`household_id\`, \`id\`, \`note\`, \`position\`, \`quantity\`, \`quantity_max\`, \`raw_text\`, \`recipe_id\`, \`section\`, \`unit\` from \`recipe_ingredients\`;`);
    this.addSql(`drop table \`recipe_ingredients\`;`);
    this.addSql(`alter table \`recipe_ingredients__temp_alter\` rename to \`recipe_ingredients\`;`);
    this.addSql(`create index \`recipe_ingredients_household_id_index\` on \`recipe_ingredients\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_ingredients_recipe_id_index\` on \`recipe_ingredients\` (\`recipe_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);

    this.addSql(`alter table \`recipes\` drop column \`tidied_at\`;`);
  }

}
