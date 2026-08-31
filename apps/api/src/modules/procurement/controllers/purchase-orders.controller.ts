import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { PurchaseOrdersService } from '../services/purchase-orders.service';
import { PurchaseOrderPdfService } from '../services/purchase-order-pdf.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrdersQueryDto,
  RejectPurchaseOrderDto,
  ReceiveItemsDto,
} from '../dto';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ReqAuthUser } from '../../../common/decorators/req-auth-user.decorator';

@Controller({ path: 'purchase-orders', version: '1' })
@UseGuards(PermissionGuard)
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly pdfService: PurchaseOrderPdfService
  ) {}

  @Post()
  @RequirePermission('purchaseOrder.create')
  create(
    @Body() createDto: CreatePurchaseOrderDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.purchaseOrdersService.create(createDto, staffId);
  }

  @Get()
  @RequirePermission('purchaseOrder.view')
  findAll(@Query() query: PurchaseOrdersQueryDto, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.purchaseOrdersService.findAll(query, staffId);
  }

  @Get(':id')
  @RequirePermission('purchaseOrder.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.purchaseOrdersService.findOne(id, staffId);
  }

  @Patch(':id')
  @RequirePermission('purchaseOrder.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdatePurchaseOrderDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.purchaseOrdersService.update(id, updateDto, staffId);
  }

  @Delete(':id')
  @RequirePermission('purchaseOrder.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.purchaseOrdersService.remove(id, staffId);
  }

  @Post(':id/submit')
  @RequirePermission('purchaseOrder.edit')
  submitForApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.purchaseOrdersService.submitForApproval(id, staffId);
  }

  @Post(':id/approve')
  @RequirePermission('purchaseOrder.approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.purchaseOrdersService.approve(id, staffId);
  }

  @Post(':id/reject')
  @RequirePermission('purchaseOrder.approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectDto: RejectPurchaseOrderDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.purchaseOrdersService.reject(id, rejectDto, staffId);
  }

  @Post(':id/cancel')
  @RequirePermission('purchaseOrder.edit')
  cancel(@Param('id', ParseUUIDPipe) id: string, @ReqAuthUser('staffId') staffId?: string | null) {
    return this.purchaseOrdersService.cancel(id, staffId);
  }

  @Post(':id/receive')
  @RequirePermission('purchaseOrder.receive')
  receiveItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() receiveDto: ReceiveItemsDto,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    return this.purchaseOrdersService.receiveItems(id, receiveDto, staffId);
  }

  @Get(':id/pdf')
  @RequirePermission('purchaseOrder.view')
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @ReqAuthUser('staffId') staffId?: string | null
  ) {
    await this.purchaseOrdersService.findOne(id, staffId);
    const pdfBuffer = await this.pdfService.generatePdf(id);
    const po = await this.purchaseOrdersService.findOne(id, staffId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${po.poNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
