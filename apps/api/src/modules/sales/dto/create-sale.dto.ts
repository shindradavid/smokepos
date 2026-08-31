import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  ValidateNested,
  Min,
  IsArray,
  ArrayMinSize,
  ArrayUnique,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerSource } from '../entities/sale.entity';
import { PaymentMethod } from '../entities/sale-payment.entity';

export class CreateSaleItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateSalePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsEnum(CustomerSource)
  customerSource?: CustomerSource;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayUnique((item: CreateSaleItemDto) => item.productId, {
    message: 'A product can only appear once in a sale',
  })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSalePaymentDto)
  initialPayment?: CreateSalePaymentDto;
}
