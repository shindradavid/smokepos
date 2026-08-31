import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteController } from './site.controller';
import { SiteWishlistController } from './site-wishlist.controller';
import { SiteService } from './site.service';
import { Product } from '../products/entities/product.entity';
import { Category } from '../products/entities/category.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category, Branch]), CustomersModule],
  controllers: [SiteController, SiteWishlistController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
