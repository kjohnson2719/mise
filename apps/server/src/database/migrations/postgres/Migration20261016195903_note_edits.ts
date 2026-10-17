import { Migration } from '@mikro-orm/migrations';

export class Migration20261016195903_note_edits extends Migration {

  override name = 'Migration20261016195903_note_edits';

  override up(): void | Promise<void> {
    this.addSql(`alter table "proposals" drop constraint "proposals_kind_check";`);
    this.addSql(`alter table "proposals" add "note" text null;`);
    this.addSql(`alter table "proposals" add constraint "proposals_kind_check" check ("kind" in ('tidy', 'note'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "proposals" drop constraint "proposals_kind_check";`);
    this.addSql(`alter table "proposals" drop column "note";`);
    this.addSql(`alter table "proposals" add constraint "proposals_kind_check" check ("kind" in ('tidy'));`);
  }

}
