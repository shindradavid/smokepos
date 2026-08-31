import {
  IsArray,
  ValidateNested,
  IsUUID,
  Min,
  ArrayMinSize,
  ArrayUnique,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveItemDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantityReceived: number;
}

export class ReceiveItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: ReceiveItemDto) => item.itemId, {
    message: 'A purchase order item can only appear once in a receipt',
  })
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
}
