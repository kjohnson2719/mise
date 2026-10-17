import { Migration } from '@mikro-orm/migrations';

export class Migration20261017164802_walmart_options extends Migration {

  override name = 'Migration20261017164802_walmart_options';

  override up(): void | Promise<void> {
    this.addSql(`alter table "store_products" add "options" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "store_products" drop column "options";`);
  }

}
