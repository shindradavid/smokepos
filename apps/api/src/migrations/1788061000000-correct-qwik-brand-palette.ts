import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectQwikBrandPalette1788061000000 implements MigrationInterface {
  name = 'CorrectQwikBrandPalette1788061000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "accent_color" SET DEFAULT '#263238'`
    );
    await queryRunner.query(
      `UPDATE "branches"
       SET "accent_color" = '#263238', "txt_on_accent_color" = '#FAFAFA'
       WHERE LOWER("accent_color") = '#560986'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "branches"
       SET "accent_color" = '#560986', "txt_on_accent_color" = '#FAFAFA'
       WHERE LOWER("accent_color") = '#263238'`
    );
    await queryRunner.query(
      `ALTER TABLE "branches" ALTER COLUMN "accent_color" SET DEFAULT '#560986'`
    );
  }
}
