import {
  IsOptional,
  IsString,
  IsUUID,
  IsBooleanString,
  IsNotEmpty,
  IsNumberString,
  IsIn,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ScopedQueryDto extends PaginationQueryDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsBooleanString()
  @IsOptional()
  isActive?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['in_stock', 'low_stock', 'out_of_stock'])
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';

  @IsNumberString()
  @IsOptional()
  minPrice?: string;

  @IsNumberString()
  @IsOptional()
  maxPrice?: string;
}
