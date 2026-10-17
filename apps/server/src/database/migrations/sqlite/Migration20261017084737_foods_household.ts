import { Migration } from '@mikro-orm/migrations';

export class Migration20261017084737_foods_household extends Migration {

  override name = 'Migration20261017084737_foods_household';

  override up(): void | Promise<void> {
    this.addSql(`create table \`food_aliases\` (\`id\` text not null primary key, \`household_id\` text not null, \`name\` text not null, \`food_key\` text not null, \`updated_at\` datetime not null, constraint \`food_aliases_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`food_aliases_household_id_index\` on \`food_aliases\` (\`household_id\`);`);
    this.addSql(`create unique index \`food_aliases_household_id_name_unique\` on \`food_aliases\` (\`household_id\`, \`name\`);`);

    this.addSql(`alter table \`recipe_ingredients\` add column \`food_key\` text null;`);
    this.addSql(`alter table \`recipe_ingredients\` add column \`food_source\` text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`food_aliases\`;`);

    this.addSql(`alter table \`recipe_ingredients\` drop column \`food_key\`;`);
    this.addSql(`alter table \`recipe_ingredients\` drop column \`food_source\`;`);
  }

}
