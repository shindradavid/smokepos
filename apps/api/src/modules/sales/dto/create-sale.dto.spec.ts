import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSaleDto } from './create-sale.dto';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

describe('CreateSaleDto', () => {
  it('accepts the same quantity field for a one-unit or multi-unit sale', async () => {
    for (const quantity of [1, 12]) {
      const dto = plainToInstance(CreateSaleDto, {
        customerId: CUSTOMER_ID,
        branchId: BRANCH_ID,
        items: [{ productId: PRODUCT_ID, quantity }],
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    }
  });

  it('accepts a walk-in sale without a customer profile', async () => {
    const dto = plainToInstance(CreateSaleDto, {
      branchId: BRANCH_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects fractional quantities', async () => {
    const dto = plainToInstance(CreateSaleDto, {
      customerId: CUSTOMER_ID,
      branchId: BRANCH_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1.5 }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects duplicate product lines', async () => {
    const dto = plainToInstance(CreateSaleDto, {
      customerId: CUSTOMER_ID,
      branchId: BRANCH_ID,
      items: [
        { productId: PRODUCT_ID, quantity: 1 },
        { productId: PRODUCT_ID, quantity: 12 },
      ],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an unsupported payment method', async () => {
    const dto = plainToInstance(CreateSaleDto, {
      customerId: CUSTOMER_ID,
      branchId: BRANCH_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      initialPayment: { amount: 10, method: 'cheque' },
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
