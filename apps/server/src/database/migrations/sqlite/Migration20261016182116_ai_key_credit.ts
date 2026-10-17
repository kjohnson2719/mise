import { Migration } from '@mikro-orm/migrations';

export class Migration20261016182116_ai_key_credit extends Migration {

  override name = 'Migration20261016182116_ai_key_credit';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`ai_usage\` add column \`key\` text null;`);
    this.addSql(`create index \`ai_usage_key_index\` on \`ai_usage\` (\`key\`);`);

    this.addSql(`alter table \`ai_keys\` add column \`credit\` double null;`);
    this.addSql(`alter table \`ai_keys\` add column \`credit_since\` datetime null;`);
    this.addSql(`alter table \`ai_keys\` add column \`out_of_credit_at\` datetime null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`ai_keys\` drop column \`credit\`;`);
    this.addSql(`alter table \`ai_keys\` drop column \`credit_since\`;`);
    this.addSql(`alter table \`ai_keys\` drop column \`out_of_credit_at\`;`);

    this.addSql(`drop index \`ai_usage_key_index\`;`);
    this.addSql(`alter table \`ai_usage\` drop column \`key\`;`);
  }

}
