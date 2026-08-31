import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder, PurchaseOrderStatus } from '../entities/purchase-order.entity';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

@Injectable()
export class PurchaseOrderPdfService {
  private readonly primaryColor = '#263238';
  private readonly secondaryColor = '#009688';
  private readonly surfaceColor = '#fafafa';

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>
  ) {}

  async generatePdf(id: string): Promise<Buffer> {
    const po = await this.poRepository.findOne({
      where: { id },
      relations: ['supplier', 'branch', 'createdBy', 'approvedBy', 'items', 'items.product'],
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.generatePdfContent(doc, po);
      doc.end();
    });
  }

  private generatePdfContent(doc: PDFKit.PDFDocument, po: PurchaseOrder): void {
    const pageWidth = doc.page.width - 100;

    this.drawHeader(doc, po, pageWidth);
    this.drawInfoSection(doc, po, pageWidth);
    this.drawItemsTable(doc, po, pageWidth);
    this.drawTotalsSection(doc, po, pageWidth);
    this.drawFooter(doc, pageWidth);
  }

  private drawHeader(doc: PDFKit.PDFDocument, po: PurchaseOrder, pageWidth: number): void {
    // Company name
    doc.fontSize(20).font('Helvetica-Bold').fillColor(this.primaryColor).text('QWIK POS', 50, 45);

    // PO Title on the right
    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor(this.primaryColor)
      .text('PURCHASE ORDER', 300, 45, { align: 'right' });

    doc.moveDown(1.5);

    // PO Number box
    const boxY = doc.y;
    doc.rect(50, boxY, pageWidth, 45).fill(this.surfaceColor).stroke('#e2e8f0');

    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text('PO NUMBER', 65, boxY + 10);
    doc
      .fillColor('#1f2937')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(po.poNumber, 65, boxY + 24);

    // Status on the right side of box
    const statusX = 350;
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text('STATUS', statusX, boxY + 10);

    const statusColor = this.getStatusColor(po.status);
    doc
      .fillColor(statusColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(this.getStatusLabel(po.status).toUpperCase(), statusX, boxY + 24);

    // Date on far right
    const dateX = 480;
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text('DATE', dateX, boxY + 10);
    doc
      .fillColor('#1f2937')
      .fontSize(12)
      .font('Helvetica')
      .text(this.formatDate(po.createdAt), dateX, boxY + 26);

    doc.y = boxY + 60;
  }

  private drawInfoSection(doc: PDFKit.PDFDocument, po: PurchaseOrder, pageWidth: number): void {
    const startY = doc.y;
    const colWidth = (pageWidth - 40) / 2;

    // FROM Section (Left)
    doc.rect(50, startY, colWidth, 100).fill(this.surfaceColor).stroke('#e2e8f0');
    doc
      .fillColor(this.primaryColor)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('FROM', 65, startY + 12);
    doc
      .fillColor('#1f2937')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(po.branch?.name || 'N/A', 65, startY + 30);
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text('QWIK POS', 65, startY + 46);

    if (po.expectedDeliveryDate) {
      doc
        .fillColor('#64748b')
        .fontSize(9)
        .font('Helvetica')
        .text('Expected Delivery:', 65, startY + 70);
      doc
        .fillColor('#1f2937')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(this.formatDate(po.expectedDeliveryDate), 65, startY + 82);
    }

    // TO Section (Right)
    const rightX = 50 + colWidth + 40;
    doc.rect(rightX, startY, colWidth, 100).fill(this.surfaceColor).stroke('#e2e8f0');
    doc
      .fillColor(this.primaryColor)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('SUPPLIER', rightX + 15, startY + 12);
    doc
      .fillColor('#1f2937')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(po.supplier?.name || 'N/A', rightX + 15, startY + 30);

    let infoY = startY + 46;
    if (po.supplier?.code) {
      doc
        .fillColor('#64748b')
        .fontSize(10)
        .font('Helvetica')
        .text(`Code: ${po.supplier.code}`, rightX + 15, infoY);
      infoY += 14;
    }
    if (po.supplier?.contactPerson) {
      doc
        .fillColor('#64748b')
        .fontSize(10)
        .font('Helvetica')
        .text(po.supplier.contactPerson, rightX + 15, infoY);
      infoY += 14;
    }
    if (po.supplier?.phone) {
      doc
        .fillColor('#64748b')
        .fontSize(10)
        .font('Helvetica')
        .text(po.supplier.phone, rightX + 15, infoY);
    }

    doc.y = startY + 115;
  }

  private drawItemsTable(doc: PDFKit.PDFDocument, po: PurchaseOrder, pageWidth: number): void {
    const tableTop = doc.y;

    // Column positions
    const col1 = 50; // #
    const col2 = 75; // Product
    const col3 = 300; // Qty
    const col4 = 360; // Unit Price
    const col5 = 450; // Total
    const rowHeight = 28;

    // Table header
    doc.rect(50, tableTop, pageWidth, rowHeight).fill(this.primaryColor);

    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
    doc.text('#', col1 + 8, tableTop + 9);
    doc.text('PRODUCT', col2 + 5, tableTop + 9);
    doc.text('QTY', col3 + 5, tableTop + 9);
    doc.text('UNIT PRICE', col4 + 5, tableTop + 9);
    doc.text('TOTAL', col5 + 5, tableTop + 9);

    // Table rows
    let y = tableTop + rowHeight;

    po.items.forEach((item, index) => {
      // Check if we need a new page
      if (y > doc.page.height - 180) {
        doc.addPage();
        y = 50;
      }

      // Alternate row background
      if (index % 2 === 0) {
        doc.rect(50, y, pageWidth, rowHeight).fill(this.surfaceColor);
      } else {
        doc.rect(50, y, pageWidth, rowHeight).fill('#ffffff');
      }

      const name = item.product?.name || item.productName || 'Unknown Product';
      const sku = item.product?.sku || item.productSku || '';

      doc.fillColor('#64748b').fontSize(10).font('Helvetica');
      doc.text((index + 1).toString(), col1 + 8, y + 9);

      doc.fillColor('#1f2937').fontSize(10).font('Helvetica-Bold');
      doc.text(name.substring(0, 35), col2 + 5, y + 5, { width: 215 });
      if (sku) {
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica');
        doc.text(`SKU: ${sku}`, col2 + 5, y + 17);
      }

      doc.fillColor('#1f2937').fontSize(10).font('Helvetica');
      doc.text(item.quantity.toString(), col3 + 5, y + 9);
      doc.text(this.formatCurrency(item.unitCost), col4 + 5, y + 9);
      doc.fillColor('#1f2937').font('Helvetica-Bold');
      doc.text(this.formatCurrency(item.quantity * item.unitCost), col5 + 5, y + 9);

      y += rowHeight;
    });

    // Table border
    doc.strokeColor('#e2e8f0').lineWidth(1);
    doc.rect(50, tableTop, pageWidth, y - tableTop).stroke();

    // Column lines
    [col2, col3, col4, col5].forEach((x) => {
      doc.moveTo(x, tableTop).lineTo(x, y).stroke();
    });

    doc.y = y;
  }

  private drawTotalsSection(doc: PDFKit.PDFDocument, po: PurchaseOrder, pageWidth: number): void {
    const startY = doc.y + 15;
    const boxWidth = 220;
    const boxX = 50 + pageWidth - boxWidth;
    const boxHeight = 90;

    // Totals box with gradient-like effect
    doc.rect(boxX, startY, boxWidth, boxHeight).fill(this.surfaceColor).stroke('#e2e8f0');

    // Items count
    doc.fillColor('#64748b').fontSize(11).font('Helvetica');
    doc.text('Items:', boxX + 20, startY + 15);
    doc.fillColor('#1f2937').fontSize(11).font('Helvetica');
    doc.text(
      `${po.items.length} item${po.items.length !== 1 ? 's' : ''}`,
      boxX + boxWidth - 80,
      startY + 15
    );

    // Subtotal
    doc.fillColor('#64748b').fontSize(12).font('Helvetica');
    doc.text('Subtotal:', boxX + 20, startY + 35);
    doc.fillColor('#1f2937').fontSize(12).font('Helvetica');
    doc.text(this.formatCurrency(po.totalAmount), boxX + boxWidth - 100, startY + 35, {
      width: 80,
      align: 'right',
    });

    // Divider line
    doc.strokeColor('#e2e8f0').lineWidth(1);
    doc
      .moveTo(boxX + 15, startY + 55)
      .lineTo(boxX + boxWidth - 15, startY + 55)
      .stroke();

    // Grand Total - larger and prominent
    doc.fillColor('#1f2937').fontSize(14).font('Helvetica-Bold');
    doc.text('TOTAL:', boxX + 20, startY + 65);
    doc.fillColor(this.secondaryColor).fontSize(18).font('Helvetica-Bold');
    doc.text(this.formatCurrency(po.totalAmount), boxX + boxWidth - 120, startY + 62, {
      width: 100,
      align: 'right',
    });

    // Created by info on the left
    if (po.createdBy) {
      doc.fillColor('#64748b').fontSize(9).font('Helvetica');
      doc.text(`Created by: ${po.createdBy.firstName} ${po.createdBy.lastName}`, 50, startY + 20);
    }
    if (po.approvedBy && po.approvedAt) {
      doc.fillColor('#64748b').fontSize(9).font('Helvetica');
      doc.text(
        `Approved by: ${po.approvedBy.firstName} ${po.approvedBy.lastName}`,
        50,
        startY + 35
      );
      doc.text(`on ${this.formatDateTime(po.approvedAt)}`, 50, startY + 48);
    }

    doc.y = startY + boxHeight + 20;
  }

  private drawFooter(doc: PDFKit.PDFDocument, pageWidth: number): void {
    const footerY = doc.page.height - 60;

    // Footer line
    doc.strokeColor('#e2e8f0').lineWidth(1);
    doc
      .moveTo(50, footerY)
      .lineTo(50 + pageWidth, footerY)
      .stroke();

    // Footer text
    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica');
    doc.text(`Generated on ${this.formatDateTime(new Date())}`, 50, footerY + 12, {
      align: 'center',
    });
    doc.text('QWIK POS | This is a computer-generated document', 50, footerY + 24, {
      align: 'center',
    });
  }

  private getStatusLabel(status: PurchaseOrderStatus): string {
    const labels: Record<PurchaseOrderStatus, string> = {
      [PurchaseOrderStatus.DRAFT]: 'Draft',
      [PurchaseOrderStatus.PENDING_APPROVAL]: 'Pending',
      [PurchaseOrderStatus.APPROVED]: 'Approved',
      [PurchaseOrderStatus.PARTIALLY_RECEIVED]: 'Partial',
      [PurchaseOrderStatus.RECEIVED]: 'Received',
      [PurchaseOrderStatus.CANCELLED]: 'Cancelled',
    };
    return labels[status] || status;
  }

  private getStatusColor(status: PurchaseOrderStatus): string {
    const colors: Record<PurchaseOrderStatus, string> = {
      [PurchaseOrderStatus.DRAFT]: '#64748b',
      [PurchaseOrderStatus.PENDING_APPROVAL]: '#d97706',
      [PurchaseOrderStatus.APPROVED]: '#2563eb',
      [PurchaseOrderStatus.PARTIALLY_RECEIVED]: '#7c3aed',
      [PurchaseOrderStatus.RECEIVED]: '#059669',
      [PurchaseOrderStatus.CANCELLED]: '#dc2626',
    };
    return colors[status] || '#64748b';
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private formatDateTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
