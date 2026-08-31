import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { StockAdjustment } from './entities/stock-adjustment.entity';
import { CategoriesController } from './controllers/categories.controller';
import { ProductsController } from './controllers/products.controller';
import { CategoriesService } from './services/categories.service';
import { ProductsService } from './services/products.service';
import { StockAdjustmentsService } from './services/stock-adjustments.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Product, StockAdjustment]), AuditLogsModule],
  controllers: [CategoriesController, ProductsController],
  providers: [CategoriesService, ProductsService, StockAdjustmentsService],
  exports: [CategoriesService, ProductsService, StockAdjustmentsService],
})
export class ProductsModule {}
