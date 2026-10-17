import { Migration } from '@mikro-orm/migrations';
import { backfillDiets } from '../../backfills/diets.ts';

export class Migration20261016041304_diets extends Migration {

  override name = 'Migration20261016041304_diets';

  override async up(): Promise<void> {
    await this.execute(`alter table \`recipes\` add column \`diets\` text not null default '';`);
    // Labels for the recipes already saved.
    await backfillDiets((sql, params) => this.execute(sql, params));
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`recipes\` drop column \`diets\`;`);
  }

}
