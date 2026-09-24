export const SECTION_CAPABILITIES = {
  drugSearch: { normalSearch: true, barcode: true, filters: ['availability', 'type', 'shape', 'classification'], notifications: true },
  inventory: { normalSearch: true, barcode: true, filters: ['stock', 'expiry', 'supplier', 'type', 'classification', 'unit', 'price'], notifications: true },
  sales: { normalSearch: true, barcode: true, filters: ['product', 'unit', 'availability', 'customer', 'saleType', 'date'], notifications: true },
  invoices: { normalSearch: true, barcode: false, filters: ['date', 'paymentStatus', 'customer', 'total', 'state'], notifications: true },
  customers: { normalSearch: true, barcode: false, filters: ['category', 'status', 'balance', 'lastPurchase', 'followup', 'area'], notifications: true },
  shortages: { normalSearch: true, barcode: false, filters: ['supplier', 'date', 'severity', 'sort', 'expiry'], notifications: true },
  orders: { normalSearch: true, barcode: false, filters: ['supplier', 'status', 'date', 'state'], notifications: true },
  attendance: { normalSearch: true, barcode: false, filters: ['employee', 'date', 'shift', 'requestStatus', 'attendanceState'], notifications: true },
  expenses: { normalSearch: true, barcode: false, filters: ['date', 'category', 'employee'], notifications: true },
  reports: { normalSearch: true, barcode: false, filters: ['date', 'category', 'employee', 'reportType'], notifications: true },
  users: { normalSearch: true, barcode: false, filters: ['role', 'status', 'permission'], notifications: true },
}
