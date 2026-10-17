import { Migration } from '@mikro-orm/migrations';

export class Migration20261016001229_invites extends Migration {

  override name = 'Migration20261016001229_invites';

  override up(): void | Promise<void> {
    this.addSql(`create table "invite_links" ("id" uuid not null, "household_id" uuid not null, "token_hash" varchar(255) not null, "role" text not null default 'member', "created_by_id" uuid null, "expires_at" timestamptz not null, "used_at" timestamptz null, "used_by_id" uuid null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "invite_links_household_id_index" on "invite_links" ("household_id");`);
    this.addSql(`alter table "invite_links" add constraint "invite_links_token_hash_unique" unique ("token_hash");`);

    this.addSql(`create table "email_invitations" ("id" uuid not null, "household_id" uuid not null, "email" varchar(255) not null, "role" varchar(255) null, "status" varchar(255) not null default 'pending', "expires_at" timestamptz not null, "created_at" timestamptz not null, "inviter_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index "email_invitations_household_id_index" on "email_invitations" ("household_id");`);
    this.addSql(`create index "email_invitations_email_index" on "email_invitations" ("email");`);

    this.addSql(`alter table "invite_links" add constraint "invite_links_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "invite_links" add constraint "invite_links_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "invite_links" add constraint "invite_links_used_by_id_foreign" foreign key ("used_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "invite_links" add constraint "invite_links_role_check" check ("role" in ('admin', 'member'));`);

    this.addSql(`alter table "email_invitations" add constraint "email_invitations_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "email_invitations" add constraint "email_invitations_inviter_id_foreign" foreign key ("inviter_id") references "users" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "invite_links" cascade;`);
    this.addSql(`drop table if exists "email_invitations" cascade;`);
  }

}
