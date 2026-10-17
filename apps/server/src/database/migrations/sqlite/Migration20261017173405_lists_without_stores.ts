import { Migration } from '@mikro-orm/migrations';

export class Migration20261017173405_lists_without_stores extends Migration {

  override name = 'Migration20261017173405_lists_without_stores';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`shopping_lists\` drop column \`store\`;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`shopping_lists\` add column \`store\` text null;`);
  }

}
