import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities from other modules
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Product } from '../products/entities/product.entity';
import { Branch } from '../branches/entities/branch.entity';
import { PurchaseOrder } from '../procurement/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../procurement/entities/purchase-order-item.entity';

// Services
import {
  SalesReportService,
  ExpenseReportService,
  InventoryReportService,
  ProcurementReportService,
  FinancialReportService,
  ReportPdfService,
} from './services';

// Controller
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      Expense,
      Product,
      Branch,
      PurchaseOrder,
      PurchaseOrderItem,
    ]),
  ],
  controllers: [ReportsController],
  providers: [
    SalesReportService,
    ExpenseReportService,
    InventoryReportService,
    ProcurementReportService,
    FinancialReportService,
    ReportPdfService,
  ],
  exports: [
    SalesReportService,
    ExpenseReportService,
    InventoryReportService,
    ProcurementReportService,
    FinancialReportService,
    ReportPdfService,
  ],
})
export class ReportsModule {}
