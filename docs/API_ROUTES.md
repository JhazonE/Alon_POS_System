# Alon POS — API Routes Reference

> **Base URL:** `/api`  
> All routes are Next.js App Router handlers located in `app/api/`.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Users & User Types](#users--user-types)
3. [User Activity Logs](#user-activity-logs)
4. [Products](#products)
5. [Suppliers](#suppliers)
6. [Customers](#customers)
7. [Customer Loyalty](#customer-loyalty)
8. [Purchase Orders](#purchase-orders)
9. [Sales](#sales)
10. [POS (Point of Sale)](#pos-point-of-sale)
11. [Inventory](#inventory)
12. [Warehouses & Shelf Locations](#warehouses--shelf-locations)
13. [Stock Adjustments & Movements](#stock-adjustments--movements)
14. [Reports](#reports)
15. [Settings](#settings)
16. [Cloud Sync](#cloud-sync)
17. [External API](#external-api)
18. [Approvals](#approvals)
19. [Data Management](#data-management)
20. [Accounts & Financials](#accounts--financials)
21. [Reference & Configuration Data](#reference--configuration-data)
22. [Migrations](#migrations)
23. [Miscellaneous](#miscellaneous)

---

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Authenticate a user and return a session token |
| `POST` | `/api/auth/signup` | Register a new user account |

---

## Users & User Types

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users |
| `POST` | `/api/users` | Create a new user |
| `PATCH` | `/api/users` | Update a user (bulk/query-based) |
| `DELETE` | `/api/users` | Delete a user (query-based) |
| `PUT` | `/api/users/[uid]` | Update a specific user by UID |
| `GET` | `/api/user-types` | List all user types/roles |
| `POST` | `/api/user-types` | Create a new user type |
| `PATCH` | `/api/user-types/[id]` | Update a specific user type |
| `DELETE` | `/api/user-types/[id]` | Delete a specific user type |

---

## User Activity Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/user-activity-logs` | Retrieve user activity log entries |
| `POST` | `/api/user-activity-logs` | Record a new user activity log entry |

---

## Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | List all products |
| `POST` | `/api/products` | Create a new product |
| `PATCH` | `/api/products/[id]` | Update a specific product |
| `GET` | `/api/products/attributes` | List all product attributes |
| `GET` | `/api/inventory-batches` | List inventory batches |
| `GET` | `/api/price-levels` | List price levels |
| `POST` | `/api/price-levels` | Create a new price level |

---

## Suppliers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/suppliers` | List all suppliers |
| `POST` | `/api/suppliers` | Create a new supplier |
| `GET` | `/api/suppliers/[id]` | Get a specific supplier |
| `PUT` | `/api/suppliers/[id]` | Update a specific supplier |
| `DELETE` | `/api/suppliers/[id]` | Delete a specific supplier |
| `GET` | `/api/suppliers/[id]/balance` | Get outstanding balance for a supplier |
| `GET` | `/api/suppliers/export` | Export suppliers to a file |
| `GET` | `/api/temp-suppliers` | List temporary/unconfirmed suppliers |

---

## Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/customers` | List all customers |
| `POST` | `/api/customers` | Create a new customer |
| `GET` | `/api/customers/[id]` | Get a specific customer |
| `PUT` | `/api/customers/[id]` | Update a specific customer |
| `DELETE` | `/api/customers/[id]` | Delete a specific customer |
| `GET` | `/api/customers/[id]/check-transactions` | Check if a customer has associated transactions |
| `GET` | `/api/customers/balances` | Get outstanding balances for all customers |
| `GET` | `/api/customers/invoices/[id]` | Get a specific customer invoice |
| `POST` | `/api/customers/invoices/[id]/payment` | Record a payment against a customer invoice |
| `GET` | `/api/customers/invoices/outstanding` | List all outstanding customer invoices |
| `GET` | `/api/customers/payments` | List customer payment records |
| `POST` | `/api/customers/payments` | Record a customer payment |
| `GET` | `/api/customer-payments` | List customer payment transactions |
| `POST` | `/api/customer-payments` | Create a new customer payment transaction |

---

## Customer Loyalty

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/customer-loyalty` | List all loyalty members |
| `POST` | `/api/customer-loyalty` | Enroll a new loyalty member |
| `PUT` | `/api/customer-loyalty/[id]` | Update a loyalty member |
| `DELETE` | `/api/customer-loyalty/[id]` | Remove a loyalty member |
| `GET` | `/api/customer-loyalty/lookup` | Look up a loyalty member by card/phone |
| `POST` | `/api/customer-loyalty/adjust-points` | Manually adjust a member's loyalty points |
| `GET` | `/api/customer-loyalty/point-history` | Get point transaction history for a member |
| `GET` | `/api/loyalty-settings` | Get loyalty program settings |
| `POST` | `/api/loyalty-settings` | Create loyalty program settings |
| `PUT` | `/api/loyalty-settings/[id]` | Update loyalty program settings |
| `DELETE` | `/api/loyalty-settings/[id]` | Delete a loyalty settings record |

---

## Purchase Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/purchase-orders` | List all purchase orders |
| `POST` | `/api/purchase-orders` | Create a new purchase order |
| `PATCH` | `/api/purchase-orders/[id]` | Update/receive a specific purchase order |
| `DELETE` | `/api/purchase-orders/[id]` | Delete a specific purchase order |
| `GET` | `/api/purchase-orders/export` | Export purchase orders to a file |

---

## Sales

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sales` | List sales records |
| `POST` | `/api/sales` | Create a new sale |
| `GET` | `/api/sales/by-date` | Get sales aggregated by date |
| `GET` | `/api/sales/by-product` | Get sales aggregated by product |
| `GET` | `/api/sales/hourly` | Get sales broken down by hour |
| `GET` | `/api/sales/monthly-category` | Get monthly sales by category |
| `GET` | `/api/sales/top-products` | Get top-selling products |
| `GET` | `/api/sales/batch-analysis` | Analyze sales by inventory batch |
| `GET` | `/api/sales/transactions` | List all sales transactions |
| `POST` | `/api/sales/transactions` | Record a sales transaction |
| `GET` | `/api/sales/orders` | List sales orders |
| `POST` | `/api/sales/orders` | Create a new sales order |
| `PUT` | `/api/sales/orders/[id]` | Update a specific sales order |
| `DELETE` | `/api/sales/orders/[id]` | Delete a specific sales order |
| `GET` | `/api/sales/returns` | List sales returns |
| `POST` | `/api/sales/returns` | Record a sales return |
| `GET` | `/api/sales/split-payments` | List split payment records |
| `POST` | `/api/sales/invoices/[id]/void` | Void a specific sales invoice |
| `GET` | `/api/sales/voids-report` | Get a report of voided transactions |
| `GET` | `/api/sales/x-reading` | Get current shift X-reading (interim report) |
| `POST` | `/api/sales/x-reading` | Save/print an X-reading |
| `GET` | `/api/sales/z-reading` | Get Z-reading (end-of-day report) |
| `POST` | `/api/sales/z-reading` | Close the day and save a Z-reading |
| `GET` | `/api/sales/overall-reading` | Get cumulative overall reading |
| `GET` | `/api/sales/ejournal` | Get the electronic journal of sales |

---

## POS (Point of Sale)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pos/checkout` | Process a POS checkout/sale |
| `POST` | `/api/pos/payment-validation` | Validate payment details before checkout |
| `POST` | `/api/pos/void-transaction` | Void a POS transaction |
| `GET` | `/api/pos/cash-transfer` | Get cash transfer records for the shift |
| `POST` | `/api/pos/cash-transfer` | Record a cash transfer in/out |
| `GET` | `/api/pos/terminals` | List POS terminals |
| `GET` | `/api/pos/shifts` | Get shift records |
| `POST` | `/api/pos/shifts` | Open a new POS shift |
| `PUT` | `/api/pos/shifts` | Update/close a POS shift |
| `GET` | `/api/pos/recent-sales` | Get recent sales for the active terminal |
| `GET` | `/api/pos-settings` | Get POS configuration settings |
| `POST` | `/api/pos-settings` | Save POS configuration settings |
| `POST` | `/api/pos-settings/upload-logo` | Upload a logo for POS receipts |
| `GET` | `/api/pos-terminals` | List all POS terminal registrations |
| `POST` | `/api/pos-terminals` | Register a new POS terminal |
| `PUT` | `/api/pos-terminals` | Update a POS terminal |
| `DELETE` | `/api/pos-terminals` | Deregister a POS terminal |
| `GET` | `/api/pos-transactions` | List POS transaction records |
| `POST` | `/api/pos-transactions` | Record a POS transaction |

---

## Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inventory/stock-counts` | List all stock count sessions |
| `POST` | `/api/inventory/stock-counts` | Start a new stock count session |
| `GET` | `/api/inventory/stock-counts/[id]` | Get a specific stock count session |
| `PUT` | `/api/inventory/stock-counts/[id]` | Update a stock count session |
| `DELETE` | `/api/inventory/stock-counts/[id]` | Delete a stock count session |
| `PUT` | `/api/inventory/stock-counts/[id]/items` | Update counted items within a stock count |
| `POST` | `/api/inventory/stock-counts/[id]/complete` | Mark a stock count as complete and apply variances |
| `GET` | `/api/inventory/transfer` | List inventory transfer records |
| `POST` | `/api/inventory/transfer` | Create an inventory transfer between warehouses |
| `POST` | `/api/inventory/adjust/bulk` | Apply bulk inventory adjustments |

---

## Warehouses & Shelf Locations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/warehouses` | List all warehouses |
| `POST` | `/api/warehouses` | Create a new warehouse |
| `GET` | `/api/warehouses/[id]` | Get a specific warehouse |
| `PUT` | `/api/warehouses/[id]` | Update a specific warehouse |
| `DELETE` | `/api/warehouses/[id]` | Delete a specific warehouse |
| `GET` | `/api/shelf-locations` | List all shelf locations |
| `POST` | `/api/shelf-locations` | Create a new shelf location |
| `PUT` | `/api/shelf-locations/[id]` | Update a specific shelf location |
| `DELETE` | `/api/shelf-locations/[id]` | Delete a specific shelf location |

---

## Stock Adjustments & Movements

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stock-adjustments` | List stock adjustment records |
| `POST` | `/api/stock-adjustments` | Create a stock adjustment entry |
| `GET` | `/api/stock-adjustments/[id]` | Get a specific stock adjustment |
| `GET` | `/api/stock-movements` | List stock movement history |
| `POST` | `/api/stock-movements` | Record a stock movement |
| `GET` | `/api/bad-orders` | List bad order (damaged/expired) records |
| `POST` | `/api/bad-orders` | Record a new bad order |
| `GET` | `/api/bad-orders/[id]` | Get a specific bad order |
| `PATCH` | `/api/bad-orders/[id]` | Update a specific bad order |
| `DELETE` | `/api/bad-orders/[id]` | Delete a specific bad order |
| `GET` | `/api/bad-orders/stats` | Get bad order statistics summary |

---

## Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reports/stats` | Get high-level dashboard statistics |
| `GET` | `/api/reports/inventory` | Get inventory valuation report |
| `GET` | `/api/reports/movements` | Get stock movement report |
| `GET` | `/api/reports/adjustments` | Get inventory adjustments report |
| `GET` | `/api/reports/velocity` | Get product velocity (turnover rate) report |
| `GET` | `/api/reports/purchases/by-supplier` | Get purchases aggregated by supplier |
| `GET` | `/api/reports/purchases/by-product` | Get purchases aggregated by product |
| `GET` | `/api/reports/soa` | Get Statement of Account (SOA) report for a customer |

---

## Settings

### General

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings/database` | Get database connection info |
| `POST` | `/api/settings/database` | Update database connection settings |
| `GET` | `/api/settings/api-config` | Get API configuration |
| `GET` | `/api/settings/api-connection` | Get external API connection status |
| `POST` | `/api/settings/api-connection` | Save external API connection settings |

### Tax Rates

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings/tax-rates` | List all tax rates |
| `POST` | `/api/settings/tax-rates` | Create a new tax rate |
| `PUT` | `/api/settings/tax-rates/[id]` | Update a specific tax rate |
| `DELETE` | `/api/settings/tax-rates/[id]` | Delete a specific tax rate |

### External API Connections

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings/external-api` | List configured external API connections |
| `POST` | `/api/settings/external-api` | Add a new external API connection |
| `PUT` | `/api/settings/external-api` | Update external API connection (bulk) |
| `PUT` | `/api/settings/external-api/[id]` | Update a specific external API connection |
| `DELETE` | `/api/settings/external-api/[id]` | Delete a specific external API connection |

### Backup & Restore

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/settings/backup/manual` | Trigger a manual database backup |
| `GET` | `/api/settings/backup/files` | List available backup files |
| `GET` | `/api/settings/backup/download/[filename]` | Download a specific backup file |
| `POST` | `/api/settings/backup/restore` | Restore the database from a backup file |
| `GET` | `/api/settings/backup/schedule` | Get the backup schedule configuration |
| `POST` | `/api/settings/backup/schedule` | Save the backup schedule configuration |

---

## Cloud Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cloud-sync/health` | Check health/connectivity of the cloud sync service |
| `GET` | `/api/cloud-sync/status` | Get the current cloud sync status and last sync time |
| `POST` | `/api/cloud-sync/push` | Push local data changes to the cloud |
| `GET` | `/api/cloud-sync/pull` | Pull data changes from the cloud |
| `POST` | `/api/sync/push` | Alternative sync push endpoint |
| `GET` | `/api/sync/pull` | Alternative sync pull endpoint |

---

## External API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/external-api/logs` | List external API call logs |
| `POST` | `/api/external-api/logs` | Record a new external API log entry |
| `POST` | `/api/external-api/logs/[id]/retry` | Retry a failed external API call |

---

## Approvals

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/approvals/workflows` | List approval workflow definitions |
| `POST` | `/api/approvals/workflows` | Create a new approval workflow |
| `GET` | `/api/approvals/queue` | Get items pending approval |
| `POST` | `/api/approvals/process` | Approve or reject a pending item |

---

## Data Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/data-management/export/customers` | Export customers to CSV/Excel |
| `GET` | `/api/data-management/export/products` | Export products to CSV/Excel |
| `GET` | `/api/data-management/export/suppliers` | Export suppliers to CSV/Excel |
| `POST` | `/api/data-management/import/customers` | Import customers from a file |
| `POST` | `/api/data-management/import/products` | Import products from a file |
| `POST` | `/api/data-management/import/suppliers` | Import suppliers from a file |
| `POST` | `/api/data-management/reset` | Reset/wipe selected data from the system |

---

## Accounts & Financials

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts` | List chart of accounts |
| `POST` | `/api/accounts` | Create a new account entry |

---

## Reference & Configuration Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/payment-methods` | List payment methods |
| `POST` | `/api/payment-methods` | Create a new payment method |
| `GET` | `/api/payment-methods/[id]` | Get a specific payment method |
| `PUT` | `/api/payment-methods/[id]` | Update a specific payment method |
| `DELETE` | `/api/payment-methods/[id]` | Delete a specific payment method |
| `GET` | `/api/payment-terms` | List payment terms |
| `POST` | `/api/payment-terms` | Create a new payment term |
| `PUT` | `/api/payment-terms` | Update a payment term (query-based) |
| `DELETE` | `/api/payment-terms` | Delete a payment term (query-based) |
| `GET` | `/api/payment-term-types` | List payment term types |
| `POST` | `/api/payment-term-types` | Create a payment term type |
| `DELETE` | `/api/payment-term-types` | Delete a payment term type |
| `GET` | `/api/sales-areas` | List sales areas |
| `POST` | `/api/sales-areas` | Create a sales area |
| `DELETE` | `/api/sales-areas` | Delete a sales area |
| `GET` | `/api/sales-groups` | List sales groups |
| `POST` | `/api/sales-groups` | Create a sales group |
| `DELETE` | `/api/sales-groups` | Delete a sales group |
| `GET` | `/api/sales-persons` | List sales persons |
| `POST` | `/api/sales-persons` | Create a sales person |
| `DELETE` | `/api/sales-persons` | Delete a sales person (query-based) |
| `PUT` | `/api/sales-persons/[id]` | Update a specific sales person |
| `DELETE` | `/api/sales-persons/[id]` | Delete a specific sales person |
| `GET` | `/api/transaction-references` | List transaction references |
| `POST` | `/api/transaction-references` | Create a transaction reference |
| `GET` | `/api/transactions/all-references` | Get all transaction reference numbers |
| `GET` | `/api/transactions/last-references` | Get the last used transaction reference |

---

## Migrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/migrate` | Run pending database migrations |
| `GET` | `/api/migrate/batch-costing` | Run/check batch costing migration |
| `GET` | `/api/migrate/fix-batch-ids` | Run/check fix for batch ID inconsistencies |

---

## Miscellaneous

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/data` | Retrieve general application data |
| `POST` | `/api/data` | Submit general application data |
| `GET` | `/api/forward` | Proxy/forward a request to another service |
| `POST` | `/api/forward` | Proxy/forward a POST request to another service |
| `GET` | `/api/send-products` | Get product push/send status |
| `POST` | `/api/send-products` | Push product data to an external system |

---

*Generated from source: `app/api/**/route.ts`*
