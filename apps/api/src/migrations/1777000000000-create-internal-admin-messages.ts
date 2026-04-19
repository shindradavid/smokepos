import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInternalAdminMessages1777000000000 implements MigrationInterface {
  name = 'CreateInternalAdminMessages1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sender_id" uuid NOT NULL, "recipient_id" uuid NOT NULL, "subject" character varying(200) NOT NULL, "body" text NOT NULL, "is_read" boolean NOT NULL DEFAULT false, "read_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_messages_sender_created" ON "messages" ("sender_id", "created_at") `);
    await queryRunner.query(`CREATE INDEX "IDX_messages_recipient_created" ON "messages" ("recipient_id", "created_at") `);
    await queryRunner.query(`CREATE INDEX "IDX_messages_recipient_unread" ON "messages" ("recipient_id", "is_read") `);
    await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_messages_sender_staff" FOREIGN KEY ("sender_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_messages_recipient_staff" FOREIGN KEY ("recipient_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_messages_recipient_staff"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_messages_sender_staff"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_messages_recipient_unread"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_messages_recipient_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_messages_sender_created"`);
    await queryRunner.query(`DROP TABLE "messages"`);
  }
}
