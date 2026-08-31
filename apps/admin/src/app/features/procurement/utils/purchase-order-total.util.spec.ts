import { calculatePurchaseOrderTotal } from './purchase-order-total.util';

describe('calculatePurchaseOrderTotal', () => {
  it('recalculates when lines are added, edited, or removed', () => {
    const lines = [{ quantity: 2, unitCost: 1_500 }];
    expect(calculatePurchaseOrderTotal(lines)).toBe(3_000);

    lines.push({ quantity: 12, unitCost: 250 });
    expect(calculatePurchaseOrderTotal(lines)).toBe(6_000);

    lines[0].quantity = 3;
    lines[1].unitCost = 300;
    expect(calculatePurchaseOrderTotal(lines)).toBe(8_100);

    lines.splice(0, 1);
    expect(calculatePurchaseOrderTotal(lines)).toBe(3_600);
  });
});
