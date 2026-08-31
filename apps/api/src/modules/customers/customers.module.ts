import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Customer } from './entities/customer.entity';
import { Wishlist } from './entities/wishlist.entity';
import { CustomersService } from './services/customers.service';
import { WishlistService } from './services/wishlist.service';
import { CustomersController } from './controllers/customers.controller';
import { Product } from '../products/entities/product.entity';
import { Branch } from '../branches/entities/branch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Wishlist, Product, Branch])],
  controllers: [CustomersController],
  providers: [CustomersService, WishlistService],
  exports: [TypeOrmModule, CustomersService, WishlistService],
})
export class CustomersModule {}
