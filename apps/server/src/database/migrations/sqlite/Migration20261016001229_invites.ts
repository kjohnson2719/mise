import { Migration } from '@mikro-orm/migrations';

export class Migration20261016001229_invites extends Migration {

  override name = 'Migration20261016001229_invites';

  override up(): void | Promise<void> {
    this.addSql(`create table \`invite_links\` (\`id\` text not null primary key, \`household_id\` text not null, \`token_hash\` text not null, \`role\` text check (\`role\` in ('admin', 'member')) not null default 'member', \`created_by_id\` text null, \`expires_at\` datetime not null, \`used_at\` datetime null, \`used_by_id\` text null, \`created_at\` datetime not null, constraint \`invite_links_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`invite_links_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null, constraint \`invite_links_used_by_id_foreign\` foreign key (\`used_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`invite_links_household_id_index\` on \`invite_links\` (\`household_id\`);`);
    this.addSql(`create unique index \`invite_links_token_hash_unique\` on \`invite_links\` (\`token_hash\`);`);
    this.addSql(`create index \`invite_links_created_by_id_index\` on \`invite_links\` (\`created_by_id\`);`);
    this.addSql(`create index \`invite_links_used_by_id_index\` on \`invite_links\` (\`used_by_id\`);`);

    this.addSql(`create table \`email_invitations\` (\`id\` text not null primary key, \`household_id\` text not null, \`email\` text not null, \`role\` text null, \`status\` text not null default 'pending', \`expires_at\` datetime not null, \`created_at\` datetime not null, \`inviter_id\` text not null, constraint \`email_invitations_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`email_invitations_inviter_id_foreign\` foreign key (\`inviter_id\`) references \`users\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`email_invitations_household_id_index\` on \`email_invitations\` (\`household_id\`);`);
    this.addSql(`create index \`email_invitations_email_index\` on \`email_invitations\` (\`email\`);`);
    this.addSql(`create index \`email_invitations_inviter_id_index\` on \`email_invitations\` (\`inviter_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`invite_links\`;`);
    this.addSql(`drop table if exists \`email_invitations\`;`);
  }

}
