import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreatePurchaseOrderDto, CreatePurchaseOrderItemDto } from './create-purchase-order.dto';
import { IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePurchaseOrderItemDto extends CreatePurchaseOrderItemDto {
  @IsOptional()
  @IsUUID()
  id?: string; // Existing item ID for updates
}

export class UpdatePurchaseOrderDto extends PartialType(
  OmitType(CreatePurchaseOrderDto, ['items', 'branchId'] as const)
) {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePurchaseOrderItemDto)
  items?: UpdatePurchaseOrderItemDto[];
}
