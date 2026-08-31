import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsArray()
  @IsOptional()
  images?: string[];

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsNumber()
  @Min(0)
  price: number;

  @Transform(({ obj, key }) => {
    const raw = obj[key];
    if (typeof raw === 'string') return raw === 'true';
    return !!raw;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;

  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const parsed = Number(value);
    return isNaN(parsed) ? undefined : parsed;
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateStockDto {
  @IsInt()
  @Min(0)
  quantity: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;
}

export class ProductResponseDto {
  id: string;
  name: string;
  description: string;
  sku: string;
  images: string[];
  categoryId: string;
  branchId: string;
  price: number;
  costPrice: number | null;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}
