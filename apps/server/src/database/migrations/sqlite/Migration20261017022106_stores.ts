import { Migration } from '@mikro-orm/migrations';

export class Migration20261017022106_stores extends Migration {

  override name = 'Migration20261017022106_stores';

  override up(): void | Promise<void> {
    this.addSql(`create table \`store_prices\` (\`id\` text not null primary key, \`household_id\` text not null, \`store\` text not null, \`product_id\` text not null, \`day\` text not null, \`price\` integer null, \`sale_price\` integer null, \`sale_ends\` text null, \`currency\` text not null, \`created_at\` datetime not null, constraint \`store_prices_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`store_prices_household_id_index\` on \`store_prices\` (\`household_id\`);`);
    this.addSql(`create unique index \`store_prices_household_id_store_product_id_day_unique\` on \`store_prices\` (\`household_id\`, \`store\`, \`product_id\`, \`day\`);`);

    this.addSql(`create table \`store_products\` (\`id\` text not null primary key, \`household_id\` text not null, \`store\` text not null, \`food\` text not null, \`product\` json not null, \`chosen\` integer not null default false, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`store_products_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`store_products_household_id_index\` on \`store_products\` (\`household_id\`);`);
    this.addSql(`create unique index \`store_products_household_id_store_food_unique\` on \`store_products\` (\`household_id\`, \`store\`, \`food\`);`);

    this.addSql(`create table \`store_connections\` (\`id\` text not null primary key, \`household_id\` text not null, \`store\` text not null, \`location\` json null, \`modality\` text check (\`modality\` in ('PICKUP', 'DELIVERY')) not null default 'PICKUP', \`account_id\` text null, \`access_expires_at\` datetime null, \`linked_by_id\` text null, \`linked_at\` datetime null, \`broken\` integer not null default false, \`pending_state\` text null, \`pending_verifier\` text null, \`pending_user_id\` text null, \`pending_until\` datetime null, \`last_sent\` json null, \`prices_checked_at\` datetime null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`store_connections_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`store_connections_account_id_foreign\` foreign key (\`account_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`store_connections_linked_by_id_foreign\` foreign key (\`linked_by_id\`) references \`users\` (\`id\`) on delete set null, constraint \`store_connections_pending_user_id_foreign\` foreign key (\`pending_user_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`store_connections_household_id_index\` on \`store_connections\` (\`household_id\`);`);
    this.addSql(`create index \`store_connections_account_id_index\` on \`store_connections\` (\`account_id\`);`);
    this.addSql(`create index \`store_connections_linked_by_id_index\` on \`store_connections\` (\`linked_by_id\`);`);
    this.addSql(`create index \`store_connections_pending_state_index\` on \`store_connections\` (\`pending_state\`);`);
    this.addSql(`create index \`store_connections_pending_user_id_index\` on \`store_connections\` (\`pending_user_id\`);`);
    this.addSql(`create unique index \`store_connections_household_id_store_unique\` on \`store_connections\` (\`household_id\`, \`store\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`store_prices\`;`);
    this.addSql(`drop table if exists \`store_products\`;`);
    this.addSql(`drop table if exists \`store_connections\`;`);
  }

}
