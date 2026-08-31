import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReqAuthUser } from '../../../common/decorators/req-auth-user.decorator';
import { AuthUser } from '../../../common/types/auth-user.interface';
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dtos/category.dto';
import { ScopedQueryDto } from '../dtos/scoped-query.dto';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';

@Controller({ path: 'categories', version: '1' })
@UseGuards(PermissionGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermission('category.create')
  @UseInterceptors(FileInterceptor('image'))
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
    @ReqAuthUser() authUser?: AuthUser
  ) {
    return this.categoriesService.create(createCategoryDto, file, authUser);
  }

  @Get()
  @UsePipes(new ValidationPipe({ transform: true }))
  @RequirePermission('category.view')
  findAll(@Query() query: ScopedQueryDto, @ReqAuthUser() authUser?: AuthUser) {
    return this.categoriesService.findAll(query, authUser);
  }

  @Get(':id')
  @RequirePermission('category.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser() authUser?: AuthUser) {
    return this.categoriesService.findOne(id, authUser);
  }

  @Patch(':id')
  @RequirePermission('category.edit')
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
    @ReqAuthUser() authUser?: AuthUser
  ) {
    return this.categoriesService.update(id, updateCategoryDto, file, authUser);
  }

  @Delete(':id')
  @RequirePermission('category.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser() authUser?: AuthUser) {
    return this.categoriesService.remove(id, authUser);
  }
}
