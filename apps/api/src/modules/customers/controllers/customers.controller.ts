import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CustomersService } from '../services/customers.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ReqAuthUser } from '../../../common/decorators/req-auth-user.decorator';

@Controller({ path: 'customers', version: '1' })
@UseGuards(PermissionGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // ========== Customer CRUD ==========

  @Post()
  @RequirePermission('customer.create')
  create(
    @Body() createCustomerDto: CreateCustomerDto,
    @Query('branchId') branchId?: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.customersService.create(createCustomerDto, branchId, staffId);
  }

  /**
   * Search customers by name, email, or phone number
   * Used for autocomplete in sale forms
   */
  @Get('search')
  @RequirePermission('customer.view')
  search(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('branchId') branchId?: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.customersService.search(q, limit ? parseInt(limit, 10) : 10, branchId, staffId);
  }

  @Get()
  @RequirePermission('customer.view')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.customersService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      branchId,
      staffId,
      search
    );
  }

  @Get(':id')
  @RequirePermission('customer.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.customersService.findOne(id, staffId);
  }

  @Patch(':id')
  @RequirePermission('customer.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.customersService.update(id, updateCustomerDto, staffId);
  }

  @Delete(':id')
  @RequirePermission('customer.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.customersService.remove(id, staffId);
  }
}
