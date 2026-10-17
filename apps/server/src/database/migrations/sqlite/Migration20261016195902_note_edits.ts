import { Migration } from '@mikro-orm/migrations';

export class Migration20261016195902_note_edits extends Migration {

  override name = 'Migration20261016195902_note_edits';

  override up(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`proposals__temp_alter\` (\`id\` text not null primary key, \`household_id\` text not null, \`kind\` text check (\`kind\` in ('tidy', 'note')) not null, \`recipe_id\` text null, \`status\` text check (\`status\` in ('pending', 'applied', 'dismissed')) not null, \`summary\` text not null, \`note\` text null, \`before\` json not null, \`after\` json not null, \`job\` text null, \`created_by_id\` text null, \`created_at\` datetime not null, \`resolved_by_id\` text null, \`resolved_at\` datetime null, constraint \`proposals_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`proposals_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`proposals_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null, constraint \`proposals_resolved_by_id_foreign\` foreign key (\`resolved_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`proposals__temp_alter\` select \`id\`, \`household_id\`, \`kind\`, \`recipe_id\`, \`status\`, \`summary\`, null as \`note\`, \`before\`, \`after\`, \`job\`, \`created_by_id\`, \`created_at\`, \`resolved_by_id\`, \`resolved_at\` from \`proposals\`;`);
    this.addSql(`drop table \`proposals\`;`);
    this.addSql(`alter table \`proposals__temp_alter\` rename to \`proposals\`;`);
    this.addSql(`create index \`proposals_household_id_index\` on \`proposals\` (\`household_id\`);`);
    this.addSql(`create index \`proposals_recipe_id_index\` on \`proposals\` (\`recipe_id\`);`);
    this.addSql(`create index \`proposals_created_by_id_index\` on \`proposals\` (\`created_by_id\`);`);
    this.addSql(`create index \`proposals_resolved_by_id_index\` on \`proposals\` (\`resolved_by_id\`);`);
    this.addSql(`create index \`proposals_household_id_status_index\` on \`proposals\` (\`household_id\`, \`status\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`proposals__temp_alter\` (\`after\` json not null, \`before\` json not null, \`created_at\` datetime not null, \`created_by_id\` text null, \`household_id\` text not null, \`id\` text not null primary key, \`job\` text null, \`kind\` text check (\`kind\` in ('tidy')) not null, \`recipe_id\` text null, \`resolved_at\` datetime null, \`resolved_by_id\` text null, \`status\` text check (\`status\` in ('pending', 'applied', 'dismissed')) not null, \`summary\` text not null, constraint \`proposals_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null, constraint \`proposals_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`proposals_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`proposals_resolved_by_id_foreign\` foreign key (\`resolved_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`proposals__temp_alter\` select \`after\`, \`before\`, \`created_at\`, \`created_by_id\`, \`household_id\`, \`id\`, \`job\`, \`kind\`, \`recipe_id\`, \`resolved_at\`, \`resolved_by_id\`, \`status\`, \`summary\` from \`proposals\`;`);
    this.addSql(`drop table \`proposals\`;`);
    this.addSql(`alter table \`proposals__temp_alter\` rename to \`proposals\`;`);
    this.addSql(`create index \`proposals_created_by_id_index\` on \`proposals\` (\`created_by_id\`);`);
    this.addSql(`create index \`proposals_household_id_index\` on \`proposals\` (\`household_id\`);`);
    this.addSql(`create index \`proposals_household_id_status_index\` on \`proposals\` (\`household_id\`, \`status\`);`);
    this.addSql(`create index \`proposals_recipe_id_index\` on \`proposals\` (\`recipe_id\`);`);
    this.addSql(`create index \`proposals_resolved_by_id_index\` on \`proposals\` (\`resolved_by_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

}
