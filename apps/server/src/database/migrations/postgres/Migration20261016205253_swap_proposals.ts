import { Migration } from '@mikro-orm/migrations';

export class Migration20261016205253_swap_proposals extends Migration {

  override name = 'Migration20261016205253_swap_proposals';

  override up(): void | Promise<void> {
    this.addSql(`alter table "proposals" drop constraint "proposals_kind_check";`);
    this.addSql(`alter table "proposals" add constraint "proposals_kind_check" check ("kind" in ('tidy', 'note', 'edit', 'recipe', 'meals', 'list', 'tastes', 'import', 'swap'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "proposals" drop constraint "proposals_kind_check";`);
    this.addSql(`alter table "proposals" add constraint "proposals_kind_check" check ("kind" in ('tidy', 'note', 'edit', 'recipe', 'meals', 'list', 'tastes', 'import'));`);
  }

}
