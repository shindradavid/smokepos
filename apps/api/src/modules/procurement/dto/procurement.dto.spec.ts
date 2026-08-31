import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto';
import { ReceiveItemsDto } from './receive-items.dto';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';

describe('Procurement DTOs', () => {
  it('does not allow a purchase order to bypass approval', async () => {
    const dto = plainToInstance(CreatePurchaseOrderDto, {
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      status: PurchaseOrderStatus.RECEIVED,
      items: [{ productId: PRODUCT_ID, quantity: 12, unitCost: 100 }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects duplicate purchase order products', async () => {
    const dto = plainToInstance(CreatePurchaseOrderDto, {
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      items: [
        { productId: PRODUCT_ID, quantity: 1, unitCost: 100 },
        { productId: PRODUCT_ID, quantity: 12, unitCost: 100 },
      ],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires a positive unit cost', async () => {
    const dto = plainToInstance(CreatePurchaseOrderDto, {
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1, unitCost: 0 }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires whole-number received quantities and unique item lines', async () => {
    const fractional = plainToInstance(ReceiveItemsDto, {
      items: [{ itemId: ITEM_ID, quantityReceived: 1.5 }],
    });
    const duplicate = plainToInstance(ReceiveItemsDto, {
      items: [
        { itemId: ITEM_ID, quantityReceived: 1 },
        { itemId: ITEM_ID, quantityReceived: 2 },
      ],
    });

    expect(await validate(fractional)).not.toHaveLength(0);
    expect(await validate(duplicate)).not.toHaveLength(0);
  });
});
