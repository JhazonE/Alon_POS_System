# verdix — Architecture Reference

## Overview

verdix is a **Next.js 16** web application that runs inside an **Electron 33** desktop shell. The web layer handles all UI and API logic; Electron provides the native windowing, printer access, and offline packaging.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | Next.js (App Router) | 16.0.8 |
| Desktop Shell | Electron | 33.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.4 |
| Component Library | shadcn/ui + Radix UI | Latest |
| Form Management | React Hook Form + Zod | 7.x / 3.x |
| Database Driver | mysql2 | 3.15 |
| Charts | Recharts | 2.x |
| Drag & Drop | @hello-pangea/dnd | 18.x |
| PDF Export | jsPDF + jspdf-autotable | 4.x |
| ESC/POS Encoding | @point-of-sale/receipt-printer-encoder | 3.x |
| Native Printer (DLL) | koffi | 2.15 |
| CSV Parsing | papaparse | 5.x |
| Scheduling | node-cron | 4.x |
| Auth (Password) | bcryptjs | 3.x |
| UUID | uuid | 13.x |

---

## Directory Structure

```
verdix/
├── app/                        # Next.js App Router root
│   ├── (app)/                  # Authenticated application shell
│   │   ├── layout.tsx          # Sidebar, breadcrumbs, notif bell, auth guard
│   │   ├── dashboard/          # Dashboard page & chart components
│   │   ├── products/           # Product catalog & actions
│   │   ├── inventory/          # Inventory management
│   │   │   ├── page.tsx        # Stock levels grid
│   │   │   ├── repackaging/    # Break-pack & consolidation
│   │   │   ├── stock-counts/   # Physical count snapshots
│   │   │   ├── shelf-board/    # Drag-and-drop shelf management
│   │   │   ├── transfer-board/ # Inter-shelf transfer board
│   │   │   ├── history/        # Adjustment history
│   │   │   └── movement/       # Stock movement log
│   │   ├── sales/              # All sales reporting & order management
│   │   ├── purchases/          # Purchase orders & bad orders
│   │   ├── customer/           # Customer list, payments, loyalty
│   │   ├── suppliers/          # Supplier list, balance, payments
│   │   ├── approvals/          # Approval workflow settings
│   │   ├── reports/            # Aggregated reports
│   │   ├── user-management/    # Users and user types/permissions
│   │   └── settings/           # All system configuration pages
│   ├── api/                    # Next.js Route Handlers (REST API)
│   │   ├── auth/               # Login / signup
│   │   ├── products/           # Product CRUD
│   │   ├── inventory/          # Stock counts, transfers, bulk adjust
│   │   ├── pos/                # Checkout, shifts, cash transfer, voids
│   │   ├── pos-settings/       # POS configuration (+ logo upload)
│   │   ├── pos-terminals/      # Terminal registration
│   │   ├── purchase-orders/    # PO CRUD and export
│   │   ├── bad-orders/         # Bad order management
│   │   ├── sales/              # Sales data & readings
│   │   ├── customers/          # Customer CRUD & invoices
│   │   ├── customer-loyalty/   # Points management
│   │   ├── suppliers/          # Supplier CRUD & balances
│   │   ├── approvals/          # Approval queue & processing
│   │   ├── reports/            # Aggregated report endpoints
│   │   ├── users/              # User management
│   │   ├── user-types/         # User type CRUD
│   │   ├── warehouses/         # Warehouse management
│   │   ├── shelf-locations/    # Shelf location CRUD
│   │   ├── price-levels/       # Price level tiers
│   │   ├── payment-methods/    # Payment method configuration
│   │   ├── payment-terms/      # Payment term types
│   │   ├── stock-adjustments/  # Manual adjustment records
│   │   ├── stock-movements/    # Movement audit trail
│   │   ├── settings/           # System settings (backup, tax, API)
│   │   ├── loyalty-settings/   # Loyalty program configuration
│   │   ├── data-management/    # Import/export/reset
│   │   ├── external-api/       # Outbound webhook logs
│   │   ├── migrate/            # Migration runners
│   │   └── ...
│   ├── pos/                    # Dedicated POS terminal page
│   ├── login/                  # Authentication page
│   └── signup/                 # Initial registration
├── components/                 # Shared React components
│   ├── ui/                     # shadcn/ui primitives
│   ├── approvals/              # Approval drawer & workflow settings drawer
│   ├── app-breadcrumbs.tsx     # Auto-generated breadcrumbs
│   ├── logo.tsx                # verdix logo component
│   └── window-controls.tsx     # Electron window min/max/close buttons
├── lib/                        # Server-side utilities & shared logic
│   ├── mysql.ts                # Database connection pool
│   ├── types.ts                # TypeScript type definitions
│   ├── family-sync.ts          # Recursive product family stock sync
│   ├── purchase-utils.ts       # Markup calculation & purchase helpers
│   ├── receipt-generator.ts    # ESC/POS receipt builder
│   ├── z-reading-generator.ts  # Z-reading report builder
│   ├── x-reading-generator.ts  # X-reading report builder
│   ├── print-approval.ts       # Approval document printer
│   ├── print-bad-order.ts      # Bad order slip printer
│   ├── credit-slip-generator.ts # Customer credit slip
│   ├── batch-deduction.ts      # FIFO batch stock deduction
│   ├── stock-movements.ts      # Stock movement recording
│   ├── approvals.ts            # Approval queue logic
│   ├── scheduler.ts            # node-cron scheduled tasks (backups, etc.)
│   ├── api-config.ts           # Dynamic API URL builder
│   ├── external-api-config.ts  # Outbound webhook configuration
│   ├── fiscal-utils.ts         # Philippine fiscal calculation helpers
│   ├── pricing.ts              # Price level resolution
│   ├── loyalty-utils.ts        # Loyalty point calculation utilities
│   ├── use-printer.ts          # React hook for printer interaction
│   ├── use-web-serial.ts       # Web Serial API hook
│   └── use-web-usb.ts          # Web USB API hook
├── hooks/                      # Global React hooks
│   └── use-toast.ts            # Global toast notifications
├── types/                      # Additional TypeScript declarations
├── scripts/                    # Database migration & seed scripts
├── main.js                     # Electron main process
├── preload.js                  # Electron preload (exposes electronAPI)
├── printer-sdk.js              # Windows Spooler DLL bridge (koffi)
├── epson-sdk.js                # Epson-specific printer helpers
└── docs/                       # ← You are here
```

---

## Data Flow

### POS Checkout Flow

```
User scans item → POS page (cart state)
    → Tender Dialog (payment method selection)
    → POST /api/pos/checkout
        → Validate shift & terminal
        → Deduct stock (batch-deduction FIFO)
        → Record StockMovement (type: sale)
        → Propagate stock to product family (family-sync)
        → Save POS transaction & line items
        → Apply loyalty points
        → Return sale record
    → Receipt generator (ESC/POS or browser print)
    → Print receipt
```

### Approval Workflow Flow

```
User submits transaction (PO / adjustment / repack / etc.)
    → Server action checks requireXxxConfirmation in pos_settings
    → If TRUE: Insert into approval_queue (status: Pending)
    → Approvals Board shows Pending card
    → L1 Approver reviews → Approve / Reject
    → If L2 required: moves to L2 Pending
    → Final Approve → finalize() server action runs the actual operation
        → e.g., receive PO → stock increment + movement log
```

### Stock Family Sync

All stock operations call `syncProductFamilyStock()` in `lib/family-sync.ts`:

```
updateStock(productId, delta)
    → Find parent/children/grandchildren
    → Recalculate each family member's stock from movements or direct adjustment
    → Update each product's stock field
```

---

## Authentication

verdix uses a **localStorage session** approach (suitable for a single-machine desktop app):

1. On login, the server validates credentials and returns a user object.
2. The client stores `mock-user-session` in `localStorage`.
3. The app layout reads this session on every navigation.
4. Cashier users are always force-redirected to `/pos`.
5. The Electron POS window authenticates separately via `PosLoginForm`.

> **Note:** For web deployment in a networked scenario, this should be upgraded to JWT/cookie-based sessions.

---

## Database

verdix uses **MySQL** (configured via `.env`):

```env
MYSQL_HOST=localhost
MYSQL_USER=verdix
MYSQL_PASSWORD=<password>
MYSQL_DATABASE=verdix_db
MYSQL_PORT=3306
```

Key tables:

| Table | Purpose |
|-------|---------|
| `products` | Product catalog |
| `inventory_batches` | Per-purchase-order stock batches (FIFO costing) |
| `stock_movements` | Full audit trail of every stock change |
| `stock_adjustments` | Manual adjustment records |
| `purchase_orders` + `purchase_order_items` | Purchase order data |
| `sales_transactions` + `sale_items` | POS and backoffice sales |
| `pos_shifts` | Cashier shift records |
| `pos_terminals` | Registered POS terminals |
| `pos_settings` | Single-row global POS configuration |
| `customers` | Customer master |
| `customer_loyalty` | Loyalty points per customer |
| `suppliers` | Supplier master |
| `approval_queue` | Multi-level approval items |
| `users` + `user_types` | Authentication & authorization |
| `warehouses` + `shelf_locations` | Physical location management |
| `payment_methods` | Configured tender types |
| `bad_orders` + `bad_order_items` | Defective/damaged stock records |
| `stock_counts` + `stock_count_items` | Physical inventory snapshots |

---

## Electron Configuration

| Setting | Value |
|---------|-------|
| App ID | `com.alonpos.system` |
| Product Name | AlonPOSSystem |
| Target | Windows Portable (.exe) |
| Main Entry | `main.js` |
| Preload | `preload.js` |

The Electron preload exposes the following APIs to the renderer:

```javascript
window.electronAPI = {
  listPrinters()         // Scan Windows installed printers via DLL
  printNative(data)      // Send ESC/POS bytes to Windows Spooler
  minimize()             // Window minimize
  maximize()             // Window maximize / restore
  close()                // Window close
  getVersion()           // App version
}
```

---

## Scheduled Tasks

`lib/scheduler.ts` uses `node-cron` for background tasks initialized at server startup:

| Task | Schedule | Description |
|------|----------|-------------|
| Database Backup | Configurable | Auto-backup MySQL to local file |
| External API Sync | Configurable | Retry failed webhook deliveries |

---

## Key Design Decisions

### Batch-Based FIFO Costing
Every purchase order creates inventory batches. When a sale deducts stock, `lib/batch-deduction.ts` depletes the oldest batch first (FIFO), enabling accurate cost-of-goods-sold calculations per transaction.

### Recursive Family Sync
Product hierarchy means stock changes must propagate to parents, children, and grandchildren. `lib/family-sync.ts` handles this recursively to prevent data inconsistency.

### Approval as a Gate
All approval-gated operations follow the same pattern: the initial submit does NOT execute the operation — it merely writes a record to `approval_queue`. The actual database mutations only run when an approver finalizes the request.

### Dual-Window Architecture
The admin dashboard and POS terminal run as separate Electron windows (via `start-electron.js --route`). This allows the store manager and cashier to work independently on the same machine.
