import { DataSource, DataSourceOptions } from 'typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { config } from 'dotenv';

// Load environment variables for CLI usage
config();

// Import all entities
import { EnvService } from './env.config';
import { Brand } from '../modules/products/entities/brand.entity';
import { Category } from '../modules/products/entities/category.entity';
import { Product } from '../modules/products/entities/product.entity';
import { User } from '../modules/auth/entities/user.entity';
import { OTP } from '../modules/auth/entities/otp.entity';
import { Session } from '../modules/auth/entities/session.entity';
import { Staff } from '../modules/staff/entities/staff.entity';
import { StaffRole } from '../modules/roles/entities/role.entity';
import { Branch } from '../modules/branches/entities/branch.entity';
import { AuditLog } from '../modules/audit-logs/entities/audit-log.entity';
import { Customer } from '../modules/customers/entities/customer.entity';
import { Vehicle } from '../modules/customers/entities/vehicle.entity';
import { Sale } from '../modules/sales/entities/sale.entity';
import { SaleItem } from '../modules/sales/entities/sale-item.entity';
import { SalePayment } from '../modules/sales/entities/sale-payment.entity';
import { Expense } from '../modules/expenses/entities/expense.entity';
import { Supplier } from '../modules/procurement/entities/supplier.entity';
import { PurchaseOrderItem } from '../modules/procurement/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../modules/procurement/entities/purchase-order.entity';
import { Wishlist } from '../modules/customers/entities/wishlist.entity';
import { StockAdjustment } from '../modules/products/entities/stock-adjustment.entity';
import { Message } from '../modules/messages/entities/message.entity';

// Export all entities for use in scripts
export const entities = [
  User,
  OTP,
  Session,
  Staff,
  StaffRole,
  Branch,
  AuditLog,
  Brand,
  Category,
  Product,
  StockAdjustment,
  Customer,
  Vehicle,
  Sale,
  SaleItem,
  SalePayment,
  Expense,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  Wishlist,
  Message,
];

// Base database options (shared between app and CLI)
export const getDataSourceOptions = (): DataSourceOptions => {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'mrpsystem',
    password: process.env.DB_PASSWORD || 'mrpsystem',
    database: process.env.DB_NAME || 'mrpsystem',
    entities,
    synchronize: false,
    migrations: ['src/migrations/**/*.ts'],
  };
};

// For NestJS TypeOrmModule (uses EnvService)

export const getDatabaseConfig = (envService: EnvService): TypeOrmModuleOptions => {
  return {
    type: 'postgres',
    host: envService.get('DB_HOST'),
    port: envService.get('DB_PORT'),
    username: envService.get('DB_USER'),
    password: envService.get('DB_PASSWORD'),
    database: envService.get('DB_NAME'),
    entities,
    synchronize: false,
    migrations: ['src/migrations/**/*.ts'],
  };
};

// Singleton DataSource for scripts and CLI
let appDataSource: DataSource | null = null;

export const getAppDataSource = (): DataSource => {
  if (!appDataSource) {
    appDataSource = new DataSource(getDataSourceOptions());
  }
  return appDataSource;
};

// Default export for TypeORM CLI
export default getAppDataSource();
