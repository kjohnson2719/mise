import { Migration } from '@mikro-orm/migrations';

export class Migration20261016053251_recipe_imported_from extends Migration {

  override name = 'Migration20261016053251_recipe_imported_from';

  override up(): void | Promise<void> {
    this.addSql(`alter table "recipes" add "imported_from" varchar(255) null;`);
    this.addSql(`create index "recipes_household_id_imported_from_index" on "recipes" ("household_id", "imported_from");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "recipes_household_id_imported_from_index";`);
    this.addSql(`alter table "recipes" drop column "imported_from";`);
  }

}
