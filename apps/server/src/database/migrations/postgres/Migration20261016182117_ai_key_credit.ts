import { Migration } from '@mikro-orm/migrations';

export class Migration20261016182117_ai_key_credit extends Migration {

  override name = 'Migration20261016182117_ai_key_credit';

  override up(): void | Promise<void> {
    this.addSql(`alter table "ai_usage" add "key" varchar(255) null;`);
    this.addSql(`create index "ai_usage_key_index" on "ai_usage" ("key");`);

    this.addSql(`alter table "ai_keys" add "credit" double precision null, add "credit_since" timestamptz null, add "out_of_credit_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "ai_keys" drop column "credit", drop column "credit_since", drop column "out_of_credit_at";`);

    this.addSql(`drop index "ai_usage_key_index";`);
    this.addSql(`alter table "ai_usage" drop column "key";`);
  }

}
