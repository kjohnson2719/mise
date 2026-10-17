import { Migration } from '@mikro-orm/migrations';

export class Migration20261017044351_store_prices extends Migration {

  override name = 'Migration20261017044351_store_prices';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`store_connections\` add column \`price_searches\` json null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`store_connections\` drop column \`price_searches\`;`);
  }

}
