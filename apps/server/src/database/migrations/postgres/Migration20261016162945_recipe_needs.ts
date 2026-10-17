import { Migration } from '@mikro-orm/migrations';

export class Migration20261016162945_recipe_needs extends Migration {

  override name = 'Migration20261016162945_recipe_needs';

  override up(): void | Promise<void> {
    this.addSql(`alter table "recipes" add "needs" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "recipes" drop column "needs";`);
  }

}
