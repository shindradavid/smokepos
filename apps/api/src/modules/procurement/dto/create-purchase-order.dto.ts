import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsEnum,
  IsIn,
  ArrayMinSize,
  ArrayUnique,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export class CreatePurchaseOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0.01)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  @IsIn([PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL])
  status?: PurchaseOrderStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: CreatePurchaseOrderItemDto) => item.productId, {
    message: 'A product can only appear once in a purchase order',
  })
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
