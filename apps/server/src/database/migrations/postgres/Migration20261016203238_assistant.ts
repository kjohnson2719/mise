import { Migration } from '@mikro-orm/migrations';

export class Migration20261016203238_assistant extends Migration {

  override name = 'Migration20261016203238_assistant';

  override up(): void | Promise<void> {
    this.addSql(`create table "discoveries" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid null, "theme" varchar(255) not null, "status" text not null, "error" text null, "recipes" jsonb not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "discoveries_household_id_index" on "discoveries" ("household_id");`);
    this.addSql(`create index "discoveries_household_id_created_at_index" on "discoveries" ("household_id", "created_at");`);

    this.addSql(`create table "chats" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid not null, "title" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "chats_household_id_index" on "chats" ("household_id");`);
    this.addSql(`create index "chats_user_id_index" on "chats" ("user_id");`);
    this.addSql(`create index "chats_household_id_user_id_updated_at_index" on "chats" ("household_id", "user_id", "updated_at");`);

    this.addSql(`create table "chat_messages" ("id" uuid not null, "household_id" uuid not null, "chat_id" uuid not null, "position" int not null, "message" jsonb not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "chat_messages_household_id_index" on "chat_messages" ("household_id");`);
    this.addSql(`create index "chat_messages_chat_id_index" on "chat_messages" ("chat_id");`);

    this.addSql(`alter table "proposals" drop constraint "proposals_kind_check";`);
    this.addSql(`alter table "proposals" add "payload" jsonb null, add "chat" varchar(255) null;`);
    this.addSql(`create index "proposals_chat_index" on "proposals" ("chat");`);
    this.addSql(`alter table "proposals" add constraint "proposals_kind_check" check ("kind" in ('tidy', 'note', 'edit', 'recipe', 'meals', 'list', 'tastes', 'import'));`);

    this.addSql(`alter table "discoveries" add constraint "discoveries_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "discoveries" add constraint "discoveries_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "discoveries" add constraint "discoveries_status_check" check ("status" in ('searching', 'done', 'failed'));`);

    this.addSql(`alter table "chats" add constraint "chats_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "chats" add constraint "chats_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);

    this.addSql(`alter table "chat_messages" add constraint "chat_messages_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_chat_id_foreign" foreign key ("chat_id") references "chats" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "chat_messages" drop constraint "chat_messages_chat_id_foreign";`);

    this.addSql(`drop table if exists "discoveries" cascade;`);
    this.addSql(`drop table if exists "chats" cascade;`);
    this.addSql(`drop table if exists "chat_messages" cascade;`);

    this.addSql(`drop index "proposals_chat_index";`);
    this.addSql(`alter table "proposals" drop constraint "proposals_kind_check";`);
    this.addSql(`alter table "proposals" drop column "payload", drop column "chat";`);
    this.addSql(`alter table "proposals" add constraint "proposals_kind_check" check ("kind" in ('tidy', 'note'));`);
  }

}
