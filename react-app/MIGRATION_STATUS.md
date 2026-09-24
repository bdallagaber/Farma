# Farma React Migration Status

## Current reality

React is currently a **parallel migration**, not a replacement for the legacy system. The `main` branch and production deployment remain unchanged. The React branch currently provides the organized application shell, authentication, global notifications, responsive mobile layout, and a growing inventory module. Legacy page links intentionally remain available until each corresponding React module reaches functional parity.

## Coverage matrix

| Area | Legacy coverage | React status | Next work |
|---|---|---|---|
| Authentication and profile | Login, session, roles, allowed pages | Basic session/profile loading is present | Centralize route guards and allowed-page enforcement |
| Inventory products | Add, edit, delete, quick quantity, Excel, QR/manual barcode, options | Partial; core product operations and Excel preview/approval are present | Purchase cost, suppliers/options, camera scanning, duplicate detection, full filters |
| Purchase cost | `product_costs`, admin-only purchase price | Missing from React product form and export parity | Add admin-only cost service/UI and permissions |
| Purchase orders | `purchase_orders`, `purchase_order_items`, create/receive/cancel/delete RPCs | Missing | Move as a complete transactional module with order history |
| Sales | `sales`, `create_sale_transaction`, customer/credit rules, barcode scanning | Missing | Highest priority after inventory because it changes stock and accounting |
| Invoices | `invoices`, invoice details, audit log, CRM link | Missing | Move after sales transaction flow |
| Customers and CRM | Customers, ledger, credit status, follow-ups, CRM reports | Missing | Move with sales and invoices to preserve credit/ledger behavior |
| Shortages and expiry | Low stock, expiry reports, export/filtering | Legacy only | Move as read-only reports first |
| Order history | Purchase order history and status actions | Missing | Move with purchase orders |
| Attendance | Requests, shifts, reports, audit, push notifications | Legacy only; push backend exists | Move after sales/inventory parity |
| Expenses | Add/edit/list and totals | Missing | Move after core pharmacy operations |
| Profit and reports | Sales/profit calculations and filters | Missing | Move after sales, invoices, expenses |
| Users and permissions | User management, roles, page permissions | Missing | Move before exposing all React routes |
| Search | Product search and barcode search | Missing | Build shared search service used by sales and inventory |
| Camera barcode scanner | Native BarcodeDetector + ZXing fallback in legacy | Missing in React | Build reusable `BarcodeScanner` component |
| Notifications | Legacy global notification script and backend | React bell/sound exists | Connect all React events after modules move |
| Versions | Legacy versions page | Missing | Low priority |

## Supabase operations found in legacy code

The migration must preserve these entities and transactional operations: `products`, `inventory`, `product_costs`, `product_barcodes`, `purchase_orders`, `purchase_order_items`, `sales`, `invoices`, `invoice_audit_log`, `customers`, `customer_ledger`, `customer_followups`, `expenses`, `shortages`, `profiles`, `custom_options`, `attendance`, `attendance_requests`, `attendance_shifts`, `employee_shift_schedule`, `attendance_settings`, and `attendance_audit_log`.

The critical RPCs are `create_sale_transaction`, `create_purchase_order`, `receive_purchase_order`, `cancel_purchase_order`, `delete_purchase_order`, `record_attendance`, `get_customer_credit_status`, and `get_attendance_report`. These should be called through dedicated services and not reimplemented in the browser with multiple independent writes.

## Migration order

1. Shared route shell, role/page guards, and reusable barcode scanner.
2. Sales transaction flow, because it is the main stock-changing workflow.
3. Invoices and customer/CRM linkage.
4. Purchase orders, receiving, costs, and order history.
5. Search, shortages, expiry filters, and reports.
6. Users and permissions.
7. Attendance, expenses, profit, and remaining low-priority pages.

A module is considered complete only when its main read, write, validation, permission, error, mobile, and audit behaviors have been compared with the legacy version. No module should replace its legacy page in production before that checklist is complete.
