import { Migration } from '@mikro-orm/migrations';

export class Migration20261016073923_plan_entry_why extends Migration {

  override name = 'Migration20261016073923_plan_entry_why';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`plan_entries\` add column \`why\` json null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`plan_entries\` drop column \`why\`;`);
  }

}
