import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SuppliersService } from '../services/suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto, SuppliersQueryDto } from '../dto';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ReqAuthUser } from '../../../common/decorators/req-auth-user.decorator';

@Controller({ path: 'suppliers', version: '1' })
@UseGuards(PermissionGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermission('supplier.create')
  create(@Body() createDto: CreateSupplierDto, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.suppliersService.create(createDto, staffId);
  }

  @Get()
  @RequirePermission('supplier.view')
  findAll(@Query() query: SuppliersQueryDto, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.suppliersService.findAll(query, staffId);
  }

  @Get('by-branch/:branchId')
  @RequirePermission('supplier.view')
  findByBranch(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.suppliersService.findByBranch(branchId, staffId);
  }

  @Get(':id')
  @RequirePermission('supplier.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.suppliersService.findOne(id, staffId);
  }

  @Patch(':id')
  @RequirePermission('supplier.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateSupplierDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.suppliersService.update(id, updateDto, staffId);
  }

  @Delete(':id')
  @RequirePermission('supplier.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.suppliersService.remove(id, staffId);
  }
}
