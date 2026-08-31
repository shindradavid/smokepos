import { calculatePurchaseOrderTotal } from './purchase-order-total';

describe('calculatePurchaseOrderTotal', () => {
  it('uses every line quantity and unit cost as the authoritative total', () => {
    expect(
      calculatePurchaseOrderTotal([
        { quantity: 1, unitCost: 1_500 },
        { quantity: 12, unitCost: 250 },
      ])
    ).toBe(4_500);
  });

  it('reflects edited and removed lines', () => {
    const items = [
      { quantity: 2, unitCost: 600 },
      { quantity: 4, unitCost: 800 },
    ];
    items[0].quantity = 5;
    items.splice(1, 1);

    expect(calculatePurchaseOrderTotal(items)).toBe(3_000);
  });
});
