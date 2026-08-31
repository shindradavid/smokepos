import { Controller, Get, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import {
  RequireAllPermissions,
  RequirePermission,
} from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ReportQueryDto } from './dto/report-query.dto';
import {
  SalesReportService,
  ExpenseReportService,
  InventoryReportService,
  ProcurementReportService,
  FinancialReportService,
  ReportPdfService,
} from './services';
import { formatReportCalendarDate } from './utils/report-date-range';

@Controller({ path: 'reports', version: '1' })
@UseGuards(PermissionGuard)
export class ReportsController {
  constructor(
    private readonly salesReportService: SalesReportService,
    private readonly expenseReportService: ExpenseReportService,
    private readonly inventoryReportService: InventoryReportService,
    private readonly procurementReportService: ProcurementReportService,
    private readonly financialReportService: FinancialReportService,
    private readonly reportPdfService: ReportPdfService
  ) {}

  // Sales Report
  @Get('sales')
  @RequirePermission('report.view', 'report.sales')
  async getSalesReport(@Query() query: ReportQueryDto) {
    return this.salesReportService.getSalesReport(query);
  }

  @Get('sales/pdf')
  @RequirePermission('report.view', 'report.sales')
  @RequireAllPermissions('report.export')
  async getSalesReportPdf(@Query() query: ReportQueryDto, @Res() res: Response) {
    const data = await this.salesReportService.getSalesReport(query);
    const pdfBuffer = await this.reportPdfService.generateSalesReportPdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sales-report-${query.startDate}-${query.endDate}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  // Expense Report
  @Get('expenses')
  @RequirePermission('report.view', 'report.expenses')
  async getExpenseReport(@Query() query: ReportQueryDto) {
    return this.expenseReportService.getExpenseReport(query);
  }

  @Get('expenses/pdf')
  @RequirePermission('report.view', 'report.expenses')
  @RequireAllPermissions('report.export')
  async getExpenseReportPdf(@Query() query: ReportQueryDto, @Res() res: Response) {
    const data = await this.expenseReportService.getExpenseReport(query);
    const pdfBuffer = await this.reportPdfService.generateExpenseReportPdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="expense-report-${query.startDate}-${query.endDate}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  // Inventory Report (no date range needed)
  @Get('inventory')
  @RequirePermission('report.view', 'report.inventory')
  async getInventoryReport(@Query('branchId', ParseUUIDPipe) branchId: string) {
    return this.inventoryReportService.getInventoryReport(branchId);
  }

  @Get('inventory/pdf')
  @RequirePermission('report.view', 'report.inventory')
  @RequireAllPermissions('report.export')
  async getInventoryReportPdf(
    @Query('branchId', ParseUUIDPipe) branchId: string,
    @Res() res: Response
  ) {
    const data = await this.inventoryReportService.getInventoryReport(branchId);
    const pdfBuffer = await this.reportPdfService.generateInventoryReportPdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="inventory-report-${formatReportCalendarDate(new Date())}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  // Procurement Report
  @Get('procurement')
  @RequirePermission('report.view', 'report.procurement')
  async getProcurementReport(@Query() query: ReportQueryDto) {
    return this.procurementReportService.getProcurementReport(query);
  }

  @Get('procurement/pdf')
  @RequirePermission('report.view', 'report.procurement')
  @RequireAllPermissions('report.export')
  async getProcurementReportPdf(@Query() query: ReportQueryDto, @Res() res: Response) {
    const data = await this.procurementReportService.getProcurementReport(query);
    const pdfBuffer = await this.reportPdfService.generateProcurementReportPdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="procurement-report-${query.startDate}-${query.endDate}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  // Financial Report
  @Get('financial')
  @RequirePermission('report.view', 'report.financial')
  async getFinancialReport(@Query() query: ReportQueryDto) {
    return this.financialReportService.getFinancialReport(query);
  }

  @Get('financial/pdf')
  @RequirePermission('report.view', 'report.financial')
  @RequireAllPermissions('report.export')
  async getFinancialReportPdf(@Query() query: ReportQueryDto, @Res() res: Response) {
    const data = await this.financialReportService.getFinancialReport(query);
    const pdfBuffer = await this.reportPdfService.generateFinancialReportPdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="financial-report-${query.startDate}-${query.endDate}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
}
