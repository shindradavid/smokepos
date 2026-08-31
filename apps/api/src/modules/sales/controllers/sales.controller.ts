import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Res,
  UseGuards,
  Query,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { SalesService } from '../services/sales.service';
import { CreateSaleDto } from '../dto/create-sale.dto';
import { UpdateSaleStatusDto } from '../dto/update-sale-status.dto';
import { SalesQueryDto } from '../dto/sales-query.dto';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ReqAuthUser } from '../../../common/decorators/req-auth-user.decorator';
import { PdfService } from '../../shared/services/pdf.service';
import { EmailService } from '../../shared/services/email.service';
import { SaleStatus } from '../entities/sale.entity';

@Controller({ path: 'sales', version: '1' })
@UseGuards(PermissionGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService
  ) {}

  @Post()
  @RequirePermission('sale.create') // Assuming we add this permission
  create(@Body() createSaleDto: CreateSaleDto, @ReqAuthUser('staffId') staffId?: string | null) {
    if (!staffId) {
      throw new ForbiddenException('Unauthorized');
    }
    return this.salesService.create(createSaleDto, staffId);
  }

  @Get()
  @RequirePermission('sale.view')
  findAll(@Query() query: SalesQueryDto, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.salesService.findAll(query, staffId);
  }

  @Get(':id')
  @RequirePermission('sale.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.salesService.findOne(id, staffId);
  }

  @Patch(':id/status')
  @RequirePermission('sale.edit')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateSaleStatusDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    if (!staffId) {
      throw new ForbiddenException('Staff not found');
    }

    return this.salesService.updateStatus(id, updateDto.status, staffId);
  }

  /**
   * Generate and download invoice PDF for a sale
   */
  @Get(':id/invoice')
  @RequirePermission('sale.view')
  async getInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    const sale = await this.salesService.findOne(id, staffId);

    // Only allow invoice for processing or delivered sales
    if (
      ![SaleStatus.PROCESSING, SaleStatus.DELIVERED, SaleStatus.COMPLETED].includes(sale.status)
    ) {
      throw new BadRequestException(
        'Invoice can only be generated for processing, delivered, or completed sales'
      );
    }

    const pdfBuffer = await this.pdfService.generateInvoice(sale);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${sale.saleId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  /**
   * Generate and email invoice PDF to customer
   */
  @Post(':id/invoice/email')
  @RequirePermission('sale.view')
  async emailInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    const sale = await this.salesService.findOne(id, staffId);

    // Check if customer has an email
    if (!sale.customer?.email) {
      throw new BadRequestException('Customer does not have an email address');
    }

    // Only allow invoice for processing or delivered sales
    if (
      ![SaleStatus.PROCESSING, SaleStatus.DELIVERED, SaleStatus.COMPLETED].includes(sale.status)
    ) {
      throw new BadRequestException(
        'Invoice can only be generated for processing, delivered, or completed sales'
      );
    }

    const pdfBuffer = await this.pdfService.generateInvoice(sale);

    await this.emailService.sendEmailWithPdf(
      sale.customer.email,
      `Invoice ${sale.saleId} - QWIK POS`,
      `Dear ${sale.customer.name},\n\nPlease find attached your invoice ${sale.saleId}.\n\nThank you for your business!\n\nKind Regards,\nQWIK POS`,
      pdfBuffer,
      `invoice-${sale.saleId}.pdf`
    );

    return { message: 'Invoice sent successfully' };
  }
}
