import { PurchaseOrderStatus } from '../../procurement/entities/purchase-order.entity';
import { calculateProcurementSummary } from './procurement-summary';

describe('calculateProcurementSummary', () => {
  it('excludes cancelled orders from headline count and value', () => {
    const summary = calculateProcurementSummary(
      [
        { status: PurchaseOrderStatus.APPROVED, count: 2, amount: 2_000 },
        { status: PurchaseOrderStatus.CANCELLED, count: 1, amount: 9_000 },
      ],
      500
    );

    expect(summary.totalPurchaseOrders).toBe(2);
    expect(summary.totalAmount).toBe(2_000);
    expect(summary.cancelledAmount).toBe(9_000);
    expect(summary.statusTotalAmount).toBe(11_000);
  });

  it('uses the actual received-item value supplied for partial receipts', () => {
    const summary = calculateProcurementSummary(
      [{ status: PurchaseOrderStatus.PARTIALLY_RECEIVED, count: 1, amount: 10_000 }],
      3_750
    );

    expect(summary.receivedAmount).toBe(3_750);
    expect(summary.totalAmount).toBe(10_000);
  });
});
