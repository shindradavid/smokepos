import { PurchaseOrderStatus } from '../../procurement/entities/purchase-order.entity';

export interface ProcurementStatusAmount {
  status: PurchaseOrderStatus;
  count: string | number;
  amount: string | number;
}

export function calculateProcurementSummary(
  statuses: ProcurementStatusAmount[],
  receivedAmount: number
) {
  let totalAmount = 0;
  let totalPurchaseOrders = 0;
  let pendingApprovalAmount = 0;
  let approvedAmount = 0;
  let cancelledAmount = 0;
  let statusTotalAmount = 0;

  for (const status of statuses) {
    const amount = Number(status.amount) || 0;
    const count = Number(status.count) || 0;
    statusTotalAmount += amount;

    if (status.status !== PurchaseOrderStatus.CANCELLED) {
      totalAmount += amount;
      totalPurchaseOrders += count;
    }

    if (status.status === PurchaseOrderStatus.PENDING_APPROVAL) {
      pendingApprovalAmount = amount;
    } else if (status.status === PurchaseOrderStatus.APPROVED) {
      approvedAmount = amount;
    } else if (status.status === PurchaseOrderStatus.CANCELLED) {
      cancelledAmount = amount;
    }
  }

  return {
    totalPurchaseOrders,
    totalAmount,
    pendingApprovalAmount,
    approvedAmount,
    receivedAmount,
    cancelledAmount,
    statusTotalAmount,
  };
}
