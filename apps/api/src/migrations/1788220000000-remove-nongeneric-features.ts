import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveNongenericFeatures1788220000000 implements MigrationInterface {
  name = 'RemoveNongenericFeatures1788220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "purchase_orders" po
      SET "total_amount" = COALESCE((
        SELECT SUM(item."quantity" * item."unit_cost")
        FROM "purchase_order_items" item
        WHERE item."purchase_order_id" = po."id"
      ), 0)
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "vehicles" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_messages" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."contact_messages_status_enum"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "brand_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "brands" CASCADE`);

    await queryRunner.query(`
      UPDATE "staff_roles"
      SET "permissions" = ARRAY(
        SELECT permission
        FROM unnest("staff_roles"."permissions") AS permission
        WHERE permission NOT LIKE 'brand.%'
          AND permission NOT LIKE 'message.%'
      )
    `);
  }

  public async down(): Promise<void> {
    // Intentionally irreversible: removed feature data and role assignments cannot be reconstructed.
  }
}
