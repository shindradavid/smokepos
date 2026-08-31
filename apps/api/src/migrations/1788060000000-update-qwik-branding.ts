import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateQwikBranding1788060000000 implements MigrationInterface {
  name = 'UpdateQwikBranding1788060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "accent_color" SET DEFAULT '#560986'`
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "txt_on_accent_color" SET DEFAULT '#FAFAFA'`
    );
    await queryRunner.query(
      `UPDATE "branches"
       SET "accent_color" = '#560986', "txt_on_accent_color" = '#FAFAFA'
       WHERE LOWER("accent_color") IN ('red', '#ee1b24')`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "branches"
       SET "accent_color" = 'red', "txt_on_accent_color" = 'white'
       WHERE LOWER("accent_color") = '#560986'`
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "txt_on_accent_color" SET DEFAULT 'white'`
    );
    await queryRunner.query(`ALTER TABLE "branches" ALTER COLUMN "accent_color" SET DEFAULT 'red'`);
  }
}
