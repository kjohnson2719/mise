import { Migration } from '@mikro-orm/migrations';

export class Migration20261016080720_made_dates extends Migration {

  override name = 'Migration20261016080720_made_dates';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`recipes\` add column \`made_off_plan_at\` datetime null;`);

    this.addSql(`alter table \`plan_entries\` add column \`cooked_at\` datetime null;`);
    // Meals cooked already: about when, the last time they were changed.
    this.addSql(`update \`plan_entries\` set \`cooked_at\` = \`updated_at\` where \`status\` = 'cooked';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`plan_entries\` drop column \`cooked_at\`;`);

    this.addSql(`alter table \`recipes\` drop column \`made_off_plan_at\`;`);
  }

}
