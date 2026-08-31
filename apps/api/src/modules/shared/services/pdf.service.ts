import { Injectable } from '@nestjs/common';
import { EnvService } from '../../../config/env.config';
import * as PDFDocument from 'pdfkit';
import { Sale } from '../../sales/entities/sale.entity';
import { SalePayment } from '../../sales/entities/sale-payment.entity';
import { format } from 'date-fns';

@Injectable()
export class PdfService {
  private readonly companyName = 'QWIK POS';
  private readonly companyAddress = 'Kampala, Uganda';
  private readonly companyPhone = '+256 791 063 897 / +256 759 204 449';

  // Brand colors
  private readonly primaryColor = '#263238';
  private readonly darkColor = '#263238';
  private readonly grayColor = '#64748b';
  private readonly lightGray = '#fafafa';

  constructor(private readonly envService: EnvService) {}

  private get companyEmail(): string {
    return this.envService.get('MAIL_USER') ?? '';
  }

  /**
   * Format currency in UGX
   */
  private formatCurrency(amount: number): string {
    return `UGX ${amount.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  /**
   * Truncate text to a maximum length with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Generate an invoice PDF for a sale
   */
  async generateInvoice(sale: Sale): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header with branding
        this.addHeader(doc, sale.status === 'completed' ? 'RECEIPT' : 'INVOICE');

        // Document info section
        const infoY = 160;

        // Left side - Document details
        const docLabel = sale.status === 'completed' ? 'Receipt No:' : 'Invoice No:';
        doc
          .fillColor(this.grayColor)
          .fontSize(9)
          .text(docLabel, 50, infoY)
          .text('Date:', 50, infoY + 18)
          .text('Status:', 50, infoY + 36);

        doc
          .fillColor(this.darkColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(sale.saleId, 130, infoY)
          .font('Helvetica')
          .text(format(new Date(sale.createdAt), 'dd MMM yyyy'), 130, infoY + 18)
          .text(sale.status.toUpperCase(), 130, infoY + 36);

        // Right side - Customer details
        doc.fillColor(this.grayColor).fontSize(9).text('Bill To:', 380, infoY);

        doc
          .fillColor(this.darkColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(sale.customer?.name || 'Walk-in Customer', 380, infoY + 18)
          .font('Helvetica')
          .text(sale.customer?.phoneNumber || '', 380, infoY + 36)
          .text(sale.customer?.email || '', 380, infoY + 54);

        // Items table with totals
        this.addItemsTable(doc, sale);

        // Footer
        this.addFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate a receipt PDF for a confirmed payment
   */
  async generateReceipt(payment: SalePayment): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const sale = payment.sale;
        const receiptId = `RCP-${payment.id.substring(0, 8).toUpperCase()}`;

        // Header
        this.addHeader(doc, 'PAYMENT RECEIPT');

        const infoY = 160;

        // Left side - Receipt details
        doc
          .fillColor(this.grayColor)
          .fontSize(9)
          .text('Receipt No:', 50, infoY)
          .text('Invoice No:', 50, infoY + 18)
          .text('Payment Date:', 50, infoY + 36)
          .text('Payment Method:', 50, infoY + 54);

        doc
          .fillColor(this.darkColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(receiptId, 140, infoY)
          .font('Helvetica')
          .text(sale?.saleId || 'N/A', 140, infoY + 18)
          .text(format(new Date(payment.createdAt), 'dd MMM yyyy, HH:mm'), 140, infoY + 36)
          .text(this.formatPaymentMethod(payment.method), 140, infoY + 54);

        if (payment.reference) {
          doc
            .fillColor(this.grayColor)
            .fontSize(9)
            .text('Reference:', 50, infoY + 72);
          doc
            .fillColor(this.darkColor)
            .fontSize(10)
            .text(payment.reference, 140, infoY + 72);
        }

        // Right side - Customer details
        doc.fillColor(this.grayColor).fontSize(9).text('Received From:', 380, infoY);

        doc
          .fillColor(this.darkColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(sale?.customer?.name || 'Walk-in Customer', 380, infoY + 18)
          .font('Helvetica')
          .text(sale?.customer?.phoneNumber || '', 380, infoY + 36)
          .text(sale?.customer?.email || '', 380, infoY + 54);

        // Main payment amount section
        const amountSectionY = 270;

        // Large centered amount box with gradient-like effect
        const boxWidth = 495;
        const boxHeight = 100;

        // Background box
        doc.rect(50, amountSectionY, boxWidth, boxHeight).fill(this.lightGray);

        // Left accent bar
        doc.rect(50, amountSectionY, 6, boxHeight).fill(this.primaryColor);

        // "Amount Received" label
        doc
          .fillColor(this.grayColor)
          .fontSize(11)
          .font('Helvetica')
          .text('Amount Received', 75, amountSectionY + 20);

        // Large amount
        doc
          .fillColor(this.primaryColor)
          .fontSize(36)
          .font('Helvetica-Bold')
          .text(this.formatCurrency(payment.amount), 75, amountSectionY + 45)
          .font('Helvetica');

        // Status badge on the right side of the box
        const badgeX = 420;
        const badgeY = amountSectionY + 35;
        doc.roundedRect(badgeX, badgeY, 100, 30, 4).fill('#dcfce7');

        doc
          .fillColor('#166534')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('✓ CONFIRMED', badgeX + 12, badgeY + 9)
          .font('Helvetica');

        // Invoice Summary Section
        const summaryY = amountSectionY + boxHeight + 30;

        doc
          .fillColor(this.darkColor)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Invoice Summary', 50, summaryY)
          .font('Helvetica');

        // Separator line
        doc
          .strokeColor(this.lightGray)
          .lineWidth(1)
          .moveTo(50, summaryY + 18)
          .lineTo(545, summaryY + 18)
          .stroke();

        // Summary table
        const tableY = summaryY + 30;
        const labelX = 50;
        const valueX = 420;

        // Invoice Total
        doc.fillColor(this.grayColor).fontSize(10).text('Invoice Total:', labelX, tableY);
        doc
          .fillColor(this.darkColor)
          .text(this.formatCurrency(sale?.totalAmount || 0), valueX, tableY, {
            align: 'right',
            width: 125,
          });

        // Total Paid (including this payment)
        doc.fillColor(this.grayColor).text('Total Amount Paid:', labelX, tableY + 22);
        doc
          .fillColor('#16a34a')
          .text(this.formatCurrency(sale?.amountPaid || 0), valueX, tableY + 22, {
            align: 'right',
            width: 125,
          });

        // This Payment
        doc.fillColor(this.grayColor).text('This Payment:', labelX, tableY + 44);
        doc
          .fillColor(this.primaryColor)
          .font('Helvetica-Bold')
          .text(this.formatCurrency(payment.amount), valueX, tableY + 44, {
            align: 'right',
            width: 125,
          })
          .font('Helvetica');

        // Separator before balance
        doc
          .strokeColor(this.lightGray)
          .lineWidth(1)
          .moveTo(300, tableY + 62)
          .lineTo(545, tableY + 62)
          .stroke();

        // Balance Due
        const balance = sale?.balance || 0;
        const balanceColor = balance > 0 ? this.primaryColor : '#16a34a';
        const balanceLabel = balance > 0 ? 'Balance Due:' : 'Fully Paid:';

        doc
          .fillColor(this.darkColor)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(balanceLabel, labelX, tableY + 72);
        doc
          .fillColor(balanceColor)
          .text(this.formatCurrency(balance), valueX, tableY + 72, { align: 'right', width: 125 })
          .font('Helvetica');

        // Approval info section
        if (payment.approvedAt) {
          const approvalY = tableY + 110;

          doc.rect(50, approvalY, 495, 40).fill('#f0fdf4');

          doc
            .fillColor('#166534')
            .fontSize(9)
            .text('Payment confirmed on:', 60, approvalY + 10);
          doc
            .font('Helvetica-Bold')
            .text(
              format(new Date(payment.approvedAt), "dd MMMM yyyy 'at' HH:mm"),
              60,
              approvalY + 24
            )
            .font('Helvetica');
        }

        // Notes if any
        if (payment.notes) {
          const notesY = payment.approvedAt ? tableY + 165 : tableY + 110;

          doc.fillColor(this.grayColor).fontSize(9).text('Notes:', 50, notesY);
          doc
            .fillColor(this.darkColor)
            .fontSize(10)
            .text(payment.notes, 50, notesY + 15, { width: 495 });
        }

        // Footer
        this.addFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private addHeader(doc: PDFKit.PDFDocument, title: string): void {
    const companyEmail = this.companyEmail;

    // Top accent bar
    doc.rect(0, 0, 612, 8).fill(this.primaryColor);

    // Company name
    doc
      .fillColor(this.primaryColor)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(this.companyName, 50, 30)
      .font('Helvetica')
      .fillColor(this.grayColor)
      .fontSize(9)
      .text(this.companyAddress, 50, 58)
      .text(`Tel: ${this.companyPhone}`, 50, 72);

    if (companyEmail) {
      doc.text(`Email: ${companyEmail}`, 50, 86);
    }

    // Document title badge
    const titleWidth = 120;
    const titleX = 495 - titleWidth;
    doc.rect(titleX, 30, titleWidth, 35).fillAndStroke(this.primaryColor, this.primaryColor);

    doc
      .fillColor('#ffffff')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(title, titleX, 42, { width: titleWidth, align: 'center' })
      .font('Helvetica');

    // Separator line
    doc.strokeColor(this.lightGray).lineWidth(2).moveTo(50, 130).lineTo(545, 130).stroke();
  }

  private addItemsTable(doc: PDFKit.PDFDocument, sale: Sale): void {
    const tableTop = 250;
    const itemX = 50;
    const qtyX = 280;
    const priceX = 340;
    const totalX = 450;

    // Table header background
    doc.rect(50, tableTop - 5, 495, 25).fill(this.darkColor);

    // Table header text
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('ITEM DESCRIPTION', itemX + 10, tableTop + 3)
      .text('QTY', qtyX, tableTop + 3)
      .text('UNIT PRICE', priceX, tableTop + 3)
      .text('TOTAL', totalX, tableTop + 3);

    // Table rows
    doc.font('Helvetica').fillColor(this.darkColor);
    let y = tableTop + 30;
    let isAlternate = false;

    if (sale.items && sale.items.length > 0) {
      for (const item of sale.items) {
        const productName = this.truncateText(
          item.product?.name || `Product ${item.productId.substring(0, 8)}`,
          40
        );
        const unitPrice = item.unitPrice;
        const total = item.quantity * unitPrice;

        // Alternate row background
        if (isAlternate) {
          doc.rect(50, y - 5, 495, 22).fill(this.lightGray);
        }

        doc
          .fillColor(this.darkColor)
          .fontSize(10)
          .text(productName, itemX + 10, y, { width: 220 })
          .text(item.quantity.toString(), qtyX, y)
          .text(this.formatCurrency(unitPrice), priceX, y)
          .font('Helvetica-Bold')
          .text(this.formatCurrency(total), totalX, y)
          .font('Helvetica');

        y += 22;
        isAlternate = !isAlternate;
      }
    }

    // Separator line before totals
    doc
      .strokeColor(this.darkColor)
      .lineWidth(1)
      .moveTo(50, y + 5)
      .lineTo(545, y + 5)
      .stroke();

    y += 15;

    // Subtotal row
    doc.fillColor(this.grayColor).fontSize(10).text('Subtotal:', priceX, y);
    doc.fillColor(this.darkColor).text(this.formatCurrency(sale.subtotal), totalX, y);
    y += 18;

    // Tax row (if applicable)
    if (sale.taxAmount > 0) {
      doc.fillColor(this.grayColor).text('Tax:', priceX, y);
      doc.fillColor(this.darkColor).text(this.formatCurrency(sale.taxAmount), totalX, y);
      y += 18;
    }

    // Total row with background
    doc.rect(priceX - 10, y - 3, 215, 22).fill(this.darkColor);
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('TOTAL:', priceX, y + 2)
      .text(this.formatCurrency(sale.totalAmount), totalX, y + 2);
    y += 28;

    // Amount Paid row
    doc.fillColor(this.grayColor).font('Helvetica').fontSize(10).text('Amount Paid:', priceX, y);
    doc.fillColor('#16a34a').text(`-${this.formatCurrency(sale.amountPaid)}`, totalX, y);
    y += 18;

    // Balance row
    const balanceColor = sale.balance > 0 ? this.primaryColor : '#16a34a';
    const balanceLabel = sale.balance > 0 ? 'Balance Due:' : 'Balance:';
    doc.fillColor(this.darkColor).font('Helvetica-Bold').text(balanceLabel, priceX, y);
    doc.fillColor(balanceColor).text(this.formatCurrency(sale.balance), totalX, y);
  }

  private addFooter(doc: PDFKit.PDFDocument): void {
    const footerY = 720;

    // Footer line
    doc
      .strokeColor(this.lightGray)
      .lineWidth(1)
      .moveTo(50, footerY - 10)
      .lineTo(545, footerY - 10)
      .stroke();

    doc
      .fillColor(this.grayColor)
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Thank you for your business!', 50, footerY, { align: 'center', width: 495 })
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Generated on ${format(new Date(), 'dd MMM yyyy, HH:mm')} | ${this.companyName}`,
        50,
        footerY + 18,
        { align: 'center', width: 495 }
      );
  }

  private formatPaymentMethod(method: string): string {
    const methods: Record<string, string> = {
      cash: 'Cash',
      bank_transfer: 'Bank Transfer',
      mobile_money: 'Mobile Money',
      card: 'Card',
      other: 'Other',
    };
    return methods[method] || method;
  }
}
