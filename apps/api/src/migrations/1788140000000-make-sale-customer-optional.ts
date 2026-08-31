import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeSaleCustomerOptional1788140000000 implements MigrationInterface {
  name = 'MakeSaleCustomerOptional1788140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" ALTER COLUMN "customer_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_c51005b2b06cec7aa17462c54f5"`);
    await queryRunner.query(
      `ALTER TABLE "sales" ADD CONSTRAINT "FK_c51005b2b06cec7aa17462c54f5" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_c51005b2b06cec7aa17462c54f5"`);
    await queryRunner.query(
      `ALTER TABLE "sales" ADD CONSTRAINT "FK_c51005b2b06cec7aa17462c54f5" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(`ALTER TABLE "sales" ALTER COLUMN "customer_id" SET NOT NULL`);
  }
}
