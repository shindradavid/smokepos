import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
  Patch,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';

import { SalesPaymentsService } from '../services/sales-payments.service';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { PaymentApprovalDto } from '../dto/payment-approval.dto';
import { PaymentsQueryDto } from '../dto/payments-query.dto';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ReqAuthUser } from '../../../common/decorators/req-auth-user.decorator';
import { PdfService } from '../../shared/services/pdf.service';
import { EmailService } from '../../shared/services/email.service';
import { PaymentStatus } from '../entities/sale-payment.entity';

@Controller({ path: 'sales', version: '1' })
@UseGuards(PermissionGuard)
export class SalesPaymentsController {
  constructor(
    private readonly paymentsService: SalesPaymentsService,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService
  ) {}

  /**
   * Get all payments with optional filters (status, branchId)
   * Used by accountants to view pending payments for approval
   */
  @Get('payments')
  @RequirePermission('sale.view', 'sale.approve_payment')
  findAll(@Query() query: PaymentsQueryDto, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.paymentsService.findAll(query, staffId);
  }

  /**
   * Get pending payments count for sidebar badge
   */
  @Get('payments/stats')
  @RequirePermission('sale.approve_payment')
  getPendingCount(
    @Query('branchId', ParseUUIDPipe) branchId: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.paymentsService.getPendingCount(branchId, staffId);
  }

  @Post(':id/payments')
  @RequirePermission('sale.edit') // Admin can record
  recordPayment(
    @Param('id', ParseUUIDPipe) saleId: string,
    @Body() dto: RecordPaymentDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    if (!staffId) throw new ForbiddenException('Staff not found');

    return this.paymentsService.recordPayment(saleId, dto, staffId);
  }

  @Patch('payments/:id/approval')
  // @RequirePermission('payment.approve') // Hypothetical permission for Accountant
  // For now using sale.edit or specific accountant role check if RBAC allows role check
  @RequirePermission('sale.approve_payment')
  processApproval(
    @Param('id', ParseUUIDPipe) paymentId: string,
    @Body() dto: PaymentApprovalDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    if (!staffId) throw new ForbiddenException('Staff not found');

    return this.paymentsService.processApproval(paymentId, dto, staffId);
  }

  /**
   * Generate and download receipt PDF for a confirmed payment
   */
  @Get('payments/:id/receipt')
  @RequirePermission('sale.view')
  async getReceipt(
    @Param('id', ParseUUIDPipe) paymentId: string,
    @Res() res: Response,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    const payment = await this.paymentsService.findOne(paymentId, staffId);

    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new BadRequestException('Receipt can only be generated for confirmed payments');
    }

    const pdfBuffer = await this.pdfService.generateReceipt(payment);
    const receiptId = `RCP-${payment.id.substring(0, 8).toUpperCase()}`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${receiptId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  /**
   * Generate and email receipt PDF to customer
   */
  @Post('payments/:id/receipt/email')
  @RequirePermission('sale.view')
  async emailReceipt(
    @Param('id', ParseUUIDPipe) paymentId: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    const payment = await this.paymentsService.findOne(paymentId, staffId);

    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new BadRequestException('Receipt can only be generated for confirmed payments');
    }

    // Check if customer has an email
    if (!payment.sale?.customer?.email) {
      throw new BadRequestException('Customer does not have an email address');
    }

    const pdfBuffer = await this.pdfService.generateReceipt(payment);
    const receiptId = `RCP-${payment.id.substring(0, 8).toUpperCase()}`;

    await this.emailService.sendEmailWithPdf(
      payment.sale.customer.email,
      `Payment Receipt ${receiptId} - QWIK POS`,
      `Dear ${payment.sale.customer.name},\n\nPlease find attached your payment receipt ${receiptId} for invoice ${payment.sale.saleId}.\n\nThank you for your payment!\n\nKind Regards,\nQWIK POS`,
      pdfBuffer,
      `receipt-${receiptId}.pdf`
    );

    return { message: 'Receipt sent successfully' };
  }
}
