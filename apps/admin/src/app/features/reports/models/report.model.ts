// Report Query
export interface ReportQuery {
  branchId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}

// Sales Report
export interface SalesReportData {
  summary: {
    totalRevenue: number;
    totalTax: number;
    costOfGoodsSold: number;
    grossProfit: number;
    grossProfitMargin: number;
    totalSales: number;
    averageOrderValue: number;
  };
  dailyTrends: {
    date: string;
    revenue: number;
    salesCount: number;
  }[];
  topProducts: {
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];
  salesByStatus: {
    status: string;
    count: number;
    revenue: number;
  }[];
  branch: {
    id: string;
    name: string;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// Expense Report
export interface ExpenseReportData {
  summary: {
    totalExpenses: number;
    approvedExpenses: number;
    pendingExpenses: number;
    rejectedExpenses: number;
    expenseCount: number;
  };
  byCategory: {
    category: string;
    amount: number;
    count: number;
    percentage: number;
  }[];
  byStatus: {
    status: string;
    amount: number;
    count: number;
  }[];
  dailyTrends: {
    date: string;
    amount: number;
    count: number;
  }[];
  topExpenses: {
    id: string;
    expenseId: string;
    title: string;
    category: string;
    amount: number;
    expenseDate: string;
  }[];
  branch: {
    id: string;
    name: string;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// Inventory Report
export interface InventoryReportData {
  summary: {
    totalProducts: number;
    totalCostValue: number;
    totalRetailValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    averageStockLevel: number;
  };
  stockByCategory: {
    categoryId: string;
    categoryName: string;
    productCount: number;
    totalQuantity: number;
    totalRetailValue: number;
    totalCostValue: number;
  }[];
  lowStockProducts: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    lowStockThreshold: number;
    price: number;
    costPrice: number | null;
    categoryName: string;
  }[];
  topValueProducts: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
    retailValue: number;
    costPrice: number | null;
    costValue: number;
  }[];
  branch: {
    id: string;
    name: string;
  };
}

// Procurement Report
export interface ProcurementReportData {
  summary: {
    totalPurchaseOrders: number;
    totalAmount: number;
    pendingApprovalAmount: number;
    approvedAmount: number;
    receivedAmount: number;
    cancelledAmount: number;
  };
  byStatus: {
    status: string;
    count: number;
    amount: number;
    percentage: number;
  }[];
  bySupplier: {
    supplierId: string;
    supplierName: string;
    orderCount: number;
    totalAmount: number;
  }[];
  monthlyTrends: {
    month: string;
    count: number;
    amount: number;
  }[];
  recentOrders: {
    id: string;
    poNumber: string;
    supplierName: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }[];
  branch: {
    id: string;
    name: string;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// Financial Report
export interface FinancialReportData {
  summary: {
    totalRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    grossProfitMargin: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    totalTax: number;
    totalCostOfAvailableStock: number;
  };
  monthlyBreakdown: {
    month: string;
    revenue: number;
    expenses: number;
    cogs: number;
    profit: number;
  }[];
  dailyTrends: {
    date: string;
    revenue: number;
    expenses: number;
    cogs: number;
    profit: number;
  }[];
  revenueByCategory: {
    category: string;
    amount: number;
    percentage: number;
  }[];
  expenseByCategory: {
    category: string;
    amount: number;
    percentage: number;
  }[];
  branch: {
    id: string;
    name: string;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}
