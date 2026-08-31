import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
import { ReviewExpenseDto } from './dto/review-expense.dto';
import { ReqAuthUser } from '../../common/decorators/req-auth-user.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller({ path: 'expenses', version: '1' })
@UseGuards(PermissionGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @RequirePermission('expense.create')
  @UseInterceptors(FileInterceptor('receipt'))
  create(
    @Body() createExpenseDto: CreateExpenseDto,
    @UploadedFile() file?: Express.Multer.File,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.expensesService.create(createExpenseDto, staffId, file);
  }

  @Get()
  @RequirePermission('expense.view')
  findAll(@Query() query: ExpensesQueryDto, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.expensesService.findAll(query, staffId);
  }

  @Get('categories')
  @RequirePermission('expense.view', 'expense.create')
  getCategories() {
    return this.expensesService.getCategories();
  }

  @Get(':id')
  @RequirePermission('expense.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.expensesService.findOne(id, staffId);
  }

  @Patch(':id')
  @RequirePermission('expense.edit')
  @UseInterceptors(FileInterceptor('receipt'))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @UploadedFile() file?: Express.Multer.File,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.expensesService.update(id, updateExpenseDto, staffId, file);
  }

  @Patch(':id/review')
  @RequirePermission('expense.approve')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reviewExpenseDto: ReviewExpenseDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.expensesService.review(id, reviewExpenseDto, staffId);
  }

  @Delete(':id')
  @RequirePermission('expense.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.expensesService.remove(id, staffId);
  }
}
