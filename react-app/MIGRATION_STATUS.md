# Farma React Migration Status

## Current reality

React is currently a **parallel migration**, not a replacement for the legacy system. The `main` branch and production deployment remain unchanged. The React branch currently provides the organized application shell, authentication, global notifications, responsive mobile layout, and a growing inventory module. Legacy page links intentionally remain available until each corresponding React module reaches functional parity.

## Coverage matrix

## Shared interaction requirements

Every migrated section must include the shared notification bell and in-system notification panel. Notifications are not limited to attendance: the common layer must support request events, stock/expiry alerts, sales/invoice events, customer/CRM events, purchase-order events, and system messages. The same notification behavior must be available to the relevant employee or administrator on every section, with the sound preference handled centrally.

Filtering is also a section-level requirement, not an optional enhancement. The target interaction matrix is:

| Section | Normal search | Barcode search/scan | Filters | Notifications |
|---|---:|---:|---:|---:|
| Drug search | Yes | Yes | Yes: availability, type, shape, classification | Yes |
| Inventory | Yes | Yes | Yes: stock state, expiry, supplier, type/classification, unit and price where applicable | Yes |
| Sales | Yes | Yes | Yes: product/unit, stock availability, sale history/date, customer and sale type where applicable | Yes |
| Invoices | Yes | No camera required | Yes: date, payment status, customer, total, invoice state | Yes |
| Customers/CRM | Yes | No | Yes: category, status, balance/credit, last purchase, follow-up state and area | Yes |
| Shortages | Yes | No camera required | Yes: supplier, date range, stock severity, sort order, expiry state | Yes |
| Purchase orders/history | Yes | No camera required | Yes: supplier, status, date range and order state | Yes |
| Attendance | Yes where applicable | No | Yes: employee, date, shift, request/status and attendance state | Yes |
| Expenses and reports | Yes where applicable | No | Yes: date range, category, employee and payment/report dimensions | Yes |
| Users/settings | Yes where applicable | No | Yes: role, status and page permissions | Yes |

The legacy pages already contain several of these controls in different implementations. During React migration they should be moved into reusable filter components and service query parameters rather than copied as page-specific ad-hoc logic.

| Area | Legacy coverage | React status | Next work |
|---|---|---|---|
| Authentication and profile | Login, session, roles, allowed pages | Basic session/profile loading is present | Centralize route guards and allowed-page enforcement |
| Inventory products | Add, edit, delete, quick quantity, Excel, QR/manual barcode, options | Core operations, admin purchase cost, Excel preview/export, filters, camera scanning, extra barcodes and duplicate checks are present | Final production acceptance test |
| Purchase cost | `product_costs`, admin-only purchase price | React form, inventory display, import/export and admin-only write are present | Add cost history UI if required by legacy parity |
| Purchase orders | `purchase_orders`, `purchase_order_items`, create/receive/cancel/delete RPCs | React creation, order history, receive/cancel/delete actions are present | Final permission and legacy parity review |
| Sales | `sales`, `create_sale_transaction`, customer/credit rules, barcode scanning | Missing | Highest priority after inventory because it changes stock and accounting |
| Invoices | `invoices`, invoice details, audit log, CRM link | Missing | Move after sales transaction flow |
| Customers and CRM | Customers, ledger, credit status, follow-ups, CRM reports | Missing | Move with sales and invoices to preserve credit/ledger behavior |
| Shortages and expiry | Low stock, expiry reports, export/filtering | React report with five-month expiry rule, filters, CSV export and print is present | Final production acceptance test |
| Order history | Purchase order history and status actions | React order history and status actions are present | Final legacy comparison |
| Attendance | Requests, shifts, reports, audit, push notifications | Legacy only; push backend exists | Move after sales/inventory parity |
| Expenses | Add/edit/list and totals | Missing | Move after core pharmacy operations |
| Profit and reports | Sales/profit calculations and filters | Missing | Move after sales, invoices, expenses |
| Users and permissions | User management, roles, page permissions | Missing | Move before exposing all React routes |
| Search | Product search and barcode search | Missing | Build shared search service used by sales and inventory |
| Camera barcode scanner | Native BarcodeDetector + ZXing fallback in legacy | Missing in React | Build reusable `BarcodeScanner` component |
| Notifications | Legacy global notification script and backend | React bell/sound plus database alerts for low/out-of-stock and five-month expiry are present | Final event coverage review |
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
