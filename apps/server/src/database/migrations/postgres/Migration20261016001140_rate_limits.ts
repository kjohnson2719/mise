import { Migration } from '@mikro-orm/migrations';

export class Migration20261016001140_rate_limits extends Migration {

  override name = 'Migration20261016001140_rate_limits';

  override up(): void | Promise<void> {
    this.addSql(`create table "rate_limits" ("id" uuid not null, "key" varchar(255) not null, "count" int not null, "last_request" bigint not null, primary key ("id"));`);
    this.addSql(`alter table "rate_limits" add constraint "rate_limits_key_unique" unique ("key");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "rate_limits" cascade;`);
  }

}
