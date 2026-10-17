import { Migration } from '@mikro-orm/migrations';

export class Migration20261016225610_nutrition extends Migration {

  override name = 'Migration20261016225610_nutrition';

  override up(): void | Promise<void> {
    this.addSql(`create table "fdc_foods" ("fdc_id" serial primary key, "description" text not null, "data_type" varchar(255) not null, "nutrients" jsonb not null, "portions" jsonb not null, "created_at" timestamptz not null);`);

    this.addSql(`create table "food_matches" ("food" varchar(255) not null, "fdc_id" int null, "grams" jsonb not null, "updated_at" timestamptz not null, primary key ("food"));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "fdc_foods" cascade;`);
    this.addSql(`drop table if exists "food_matches" cascade;`);
  }

}
