# Alon POS — Feature Reference

This document provides a comprehensive description of every module and feature in Alon POS Enterprise, including business purpose, usage workflows, configuration options, and field-level details.

---

## Table of Contents

1. [Point of Sale (POS)](#1-point-of-sale-pos)
2. [Dashboard](#2-dashboard)
3. [Products](#3-products)
4. [Inventory](#4-inventory)
5. [Sales](#5-sales)
6. [Purchases](#6-purchases)
7. [Customers](#7-customers)
8. [Suppliers](#8-suppliers)
9. [Approvals Board](#9-approvals-board)
10. [Reports](#10-reports)
11. [User Management](#11-user-management)
12. [Settings](#12-settings)

---

## 1. Point of Sale (POS)

**Route:** `/pos`  
**Access:** Cashiers (full-screen Electron window) and Admins.

The POS is the primary front-end cashiering terminal. It runs inside an isolated **Electron** window with its own login screen and shift management system, keeping the cashier environment completely separate from the backoffice. All POS data is stored in the central MySQL database, giving backoffice users real-time visibility into sales activity.

> **Why Electron?** Electron allows the POS to operate as a native desktop application, enabling direct USB serial printer communication, offline-capable local operation, and a dedicated full-screen kiosk mode — all on standard Windows hardware.

---

### 1.1 Shift Management

A **shift** is the period during which a cashier takes responsibility for a POS terminal. All transactions, cash movements, and readings are scoped to the active shift.

| Action | Description |
|--------|-------------|
| **Start Shift** | The cashier declares a **starting cash amount** (opening fund) before processing any transaction. This figure seeds the expected cash-in-drawer calculation for the X/Z readings. |
| **End Shift (X-Reading)** | Generates a real-time shift summary (see [1.5 X-Reading & Z-Reading](#15-x-reading--z-reading)) without closing the Z-counter. Useful for mid-day checks without officially ending the working shift. |
| **Shift Takeover** | A new cashier can take over an existing open shift — useful when the original cashier leaves suddenly. Requires **admin PIN authentication** before the handover is recorded. |
| **Cash Transfer** | Mid-shift cash movements: **Pickup** (removing excess cash from the drawer for safekeeping) and **Deposit** (adding petty cash to the drawer). Both types are logged with amount, reason, and timestamp, and are included in the reading totals. |

---

### 1.2 Checkout & Tender

The main checkout screen is the heart of the POS. Items are added to the cart using several input methods:

- **Barcode / SKU Scanning** — Scans product barcodes via USB barcode reader. The system looks up the matching SKU instantly and increments the line quantity if the item is already in the cart.
- **Product Search Dialog** — A fuzzy-search dialog opened when the barcode does not match or when the cashier needs to browse. Products can be filtered by name, SKU, or category. Optionally displays current stock quantities to help cashiers advise customers.
- **Quantity Adjustment** — The cashier can manually increase or decrease the quantity of any line item in the cart using +/− buttons or direct keyboard entry.

#### Payment & Discounts

- **Multi-Payment Tender** — A single transaction can be split across multiple payment methods simultaneously:
  - Cash (change calculation is automatic)
  - Credit / Debit Card
  - GCash
  - PayMaya
  - Check
  - Any custom payment method configured in Settings

- **Loyalty Points Redemption** — When a customer is attached to the transaction, their accumulated loyalty points balance is displayed. The cashier can apply some or all points as a discount (converted using the configured points-to-currency ratio).

- **Senior Citizen / PWD Discount (SC/PWD)** — Applies the statutory **20% discount** as required by Philippine law. The discount is applied at the **line-item level** (not a blanket order discount), and the receipt prints the SC/PWD ID number and computed VAT-exempt amount. Only eligible items are discounted.

- **Custom Line Discount** — A per-item discount (percentage or fixed peso amount) that can be applied individually. Requires optional admin PIN if price-edit auth is enabled.

- **Price-Override (F7)** — Overrides the retail price for a single line item in the current transaction. This change is **not saved** back to the product catalog. Requires admin PIN authentication if configured.

- **Item Description Edit (F1)** — Edits the display name / description of a cart item for the current transaction only. Useful when a product needs a custom label on the receipt (e.g., "Special Order — Custom Frame"). The product name in the catalog is unchanged.

- **Hold Transaction** — Parks the current cart under a named hold slot so the cashier can serve another customer. The held transaction can be recalled at any time. Multiple transactions can be held simultaneously.

- **Customer Selection** — Attaches a customer account to the sale, enabling:
  - Automatic price level application (e.g., wholesale pricing)
  - Loyalty point earning
  - Charge-to-account / credit balance tracking

- **Insufficient Stock Dialog** — When a product's stock falls below the quantity being sold, the system can either **warn** the cashier (they can override and proceed) or **block** the sale entirely. This behavior is controlled by the "Allow Negative Inventory" toggle in POS Setup.

- **Training Mode** — When enabled from POS Setup, all transactions processed in this mode are flagged as training transactions. They are excluded from all official Z-reading totals, reports, and revenue figures. A visible banner appears on-screen to remind the cashier they are in training mode.

---

### 1.3 Receipt & Printing

Alon POS supports two printing architectures to accommodate different hardware environments:

| Mode | How It Works |
|------|-------------|
| **Browser Print** | Uses the browser's native `window.print()` API with a pre-installed printer driver. Simple to configure, suitable for most setups. |
| **Native DLL (Windows Spooler)** | Uses the `koffi` native module to call the Windows Print Spooler API directly (`winspool.drv`). More reliable for ESC/POS thermal printers that may not expose a standard driver. Configured per terminal. |

**Receipt Features:**

- **Official Receipt / Invoice** — BIR-compliant Official Receipt (OR) with sequential OR number per terminal. Includes business name, address, TIN, VAT breakdown, and the mandatory BIR machine identification fields.
- **ESC/POS Encoding** — Generates raw ESC/POS binary commands for direct thermal printer output. Supports 58 mm and 80 mm thermal paper widths.
- **Print Two Receipts** — Optional: prints a second (duplicate) copy automatically on each tender. Useful for businesses that retain a copy.
- **Credit Slip** — Automatically generated when a charge-to-account sale is processed. The printout serves as the customer's acknowledgment of the credit transaction.

---

### 1.4 Post-Transaction Operations

| Operation | Keyboard Shortcut | Description |
|-----------|-------------------|-------------|
| **Recent Sales** | `F8` | Browse and reprint any transaction processed during the current shift. Useful for customers who need a duplicate receipt. Optionally requires admin PIN. |
| **Void Transaction** | `F9` | Fully cancels the most recent completed sale. All stock quantities are restored. Requires optional admin PIN. The voided transaction is retained in the database with a VOID status. |
| **Return / Merchandise Credit** | — | Opens the Return Dialog, allowing the cashier to select a previous transaction, choose which items to return, and specify the refund method. A Merchandise Credit receipt is printed. Returns reverse the stock decrement. |
| **Price Inquiry** | `F6` | Look up the current retail price of any product by scanning its barcode or searching by name. Does NOT add the item to the cart — purely informational. |
| **Cancel Sale** | `ESC` | Clears the entire current cart without generating a transaction record. |
| **Line Void** | — | Removes a single item line from the active cart (before tendering). Requires optional admin PIN if configured. |

---

### 1.5 X-Reading & Z-Reading

**X-Reading (Intermediate Shift Report)**

An X-Reading is a **non-destructive** snapshot of the current shift totals. It can be printed at any point during a shift without affecting any counters or closing the shift. Used by managers to monitor sales progress intra-day.

Contents:
- Gross sales, VAT amount, Net sales
- Payment method breakdown
- Total discounts and returns
- Cash-in-drawer reconciliation (opening fund + cash sales − pickups + deposits)

**Z-Reading (Official End-of-Day Closing Report)**

The Z-Reading is the **official daily closing report** per POS terminal. Processing a Z-Reading:

1. Finalizes the shift and increments the **Z-counter** (a running sequential number required by BIR).
2. Locks the shift so no further transactions can be posted to it.
3. Generates a BIR-compliant report including:
   - Gross Sales, VAT Amount, Net Sales, Zero-Rated, VAT-Exempt
   - Discount and return totals
   - Running Grand Total (cumulative since the terminal was first activated)
   - Transaction number range (first OR number to last OR number in the shift)
   - Terminal serial number, MIN (Machine Identification Number), and TIN
4. The report can be printed on thermal paper or saved as a PDF.

---

### 1.6 POS Security

Each of the following sensitive actions can be individually protected by a **secondary admin credential check** (username + password or PIN). This is configured under POS Setup → Authentication Guards:

| Guard | Protects |
|-------|----------|
| **Line Void Auth** | Removing a line item from an active cart |
| **Void / Return Auth** | Voiding a completed sale or processing a return |
| **Recent Sales Auth** | Viewing and reprinting previous transactions |
| **Price Edit Auth** | Overriding an item price (F7) |
| **Edit Item Auth** | Editing an item's name in the cart (F1) |
| **Suspend Auth** | Suspending (holding) the current transaction (F4) |
| **Suspended Auth** | Viewing the list of suspended/held transactions (F5) |
| **Tax Rates Auth** | Modifying tax rate settings from the POS |
| **Cash Count Auth** | Accessing the end-shift cash counting screen |

When a guard is triggered, a modal dialog appears asking for the authorized user's credentials. The action proceeds only if the credentials are valid and the user has the required role.

---

### 1.7 POS Function Buttons & Keyboard Shortcuts

Alon POS's POS interface is designed for speed. Every common action has a dedicated **on-screen button** and a corresponding **keyboard shortcut** so cashiers never need to use a mouse. The shortcuts are grouped into three zones:

1. **Header Bar (F-Key Buttons)** — the primary action row at the top of the POS screen
2. **Footer Bar (Ctrl+Key Buttons)** — secondary management actions at the bottom of the POS screen
3. **Cart Navigation Keys** — keyboard keys for moving between line items and adjusting quantities

---

#### Header Bar — F-Key Buttons

These 8 buttons are always visible at the top of the POS screen. Each button shows its icon, label, and keyboard shortcut badge.

| Button | Shortcut | Color | Description | Auth Required? |
|--------|----------|-------|-------------|----------------|
| **Edit Item** | `F1` | Blue | Opens the Edit Item dialog for the currently selected cart line. Allows changing the **item display name** (transaction-level rename — does not affect the product catalog). | No |
| **Line Void** | `F2` | Red | Opens the Cancel Sale dialog to remove the selected line item (partial or full void) or clear all items from the cart. | Optional — if "Line Void Auth" is enabled, prompts for admin credentials first. |
| **Discount** | `F3` | Green | Opens the Discount dialog for the selected cart item. Allows entering a **percentage or fixed discount** for that line, or applying a **global discount to all items** in the cart. | No |
| **Suspend** | `F4` | Orange | **Holds** (parks) the current cart. All items are saved to a hold slot and the cart is cleared, allowing the cashier to start a new transaction immediately. | No |
| **Suspended** | `F5` | Orange | Opens the Held Transactions dialog to **view all parked carts**. The cashier can restore a held cart or delete it. A badge shows the number of currently held transactions. | No |
| **Quantity** | `F6` | Indigo | Opens the Adjust Quantity dialog for the selected cart line. The cashier can type a new quantity directly instead of using +/− buttons. | No |
| **Edit Price** | `F7` | Purple | Overrides the retail price of the selected cart item **for this transaction only**. The price change is not saved to the product catalog. | Optional — if "Price Edit Auth" is enabled, prompts for admin credentials first. |
| **Endorse/Out** | `F8` | Slate | Opens a shutdown/logout confirmation dialog. If a shift is active, the button label shows "Endorse/Out". Confirms before closing the POS session. | No |

---

#### Additional F-Key Shortcuts (Keyboard Only)

These shortcuts do not have dedicated header buttons but are accessible via keyboard at any time:

| Shortcut | Action | Description |
|----------|--------|-------------|
| `F9` | **Product Search** | Opens/closes the Product Search dialog. The cashier can search by name, SKU, or category and add items to the cart without scanning. |
| `F10` | **Credit Card Tender** | Opens the Tender dialog pre-set to Credit/Debit Card payment. |
| `F11` | **E-Wallet Tender** | Opens the Tender dialog pre-set to E-Wallet (GCash / PayMaya) payment. |
| `F12` | **Points Tender** | Opens the Tender dialog pre-set to Loyalty Points payment. |
| `Enter` | **Add Item / Tender** | If the barcode/SKU input field has a value → adds the item. If the field is empty → opens the Tender (Cash) dialog. |

---

#### Footer Bar — Ctrl+Key Buttons

These 9 buttons appear at the bottom of the POS cart area. They handle shift management and post-transaction operations:

| Button | Shortcut | Color | Description |
|--------|----------|-------|-------------|
| **Cash Count** | `Ctrl+1` | Green | Opens the End Shift dialog for the **cash counting and shift closure** process. If "Cash Count Auth" is enabled, admin credentials are required first. Calculates opening fund + cash sales + deposits − pickups = expected cash vs. actual count. |
| **Cash Transfer** | `Ctrl+2` | Green | Opens the Cash Transfer dialog to record a mid-shift **Pickup** (remove cash from drawer) or **Deposit** (add cash to drawer). Both are logged and included in X/Z reading totals. |
| **Customer** | `Ctrl+3` | Blue | Opens the Customer Account dialog to **search and attach a customer** to the current transaction. Automatically applies the customer's assigned price level and enables loyalty point earning/redemption. |
| **Loyalty** | `Ctrl+4` | Blue | Opens the Loyalty Rewards dialog showing the **current customer's loyalty point balance** and redemption options. Only available when a non-walk-in customer is selected. |
| **Recent Sales** | `Ctrl+5` | Yellow | Opens the Recent Sales dialog showing all transactions processed **in the current shift**. The cashier can view full details and **reprint** any receipt. The transaction list can be searched by SI #, SO #, or **customer name** and filtered by a **date range** (server-side, across full history). Optionally requires admin auth. |
| **Post Void** | `Ctrl+6` | Yellow | Opens the Post Void (Void Sales) dialog to **cancel a previously completed transaction** from the current or a previous shift. The transaction list can be searched by SI #, SO #, or **customer name** and filtered by a **date range**. Creates a void record while preserving the original; reverses stock. |
| **Merch Credit** | `Ctrl+7` | Yellow | Opens the Return / Merchandise Credit dialog. The cashier selects a previous transaction (searchable by SI #, SO #, or **customer name** and filterable by a **date range**), chooses which items to return, and records the refund method. Generates a **Merchandise Credit receipt** and restores stock. |
| **Z-READING** | `Ctrl+0` | Purple | Opens the Z-Reading dialog to generate the **official end-of-day closing report** for the selected terminal. Increments the Z-counter. BIR-compliant with VAT breakdown and running totals. |
| **Price Inquiry** | `Ctrl+P` | Purple | Opens the Price Inquiry dialog to **look up the current price of any product** by scanning or searching — without adding it to the cart. Useful for customer price checks at the counter. |

---

#### Cart Navigation & Quick-Edit Keys

When the barcode input field is empty (or not focused), these keys operate on the **currently selected cart line**:

| Key | Action |
|-----|--------|
| `↑` (Arrow Up) | Move selection to the **previous line item** in the cart. Wraps around to the last item. |
| `↓` (Arrow Down) | Move selection to the **next line item** in the cart. Wraps around to the first item. |
| `+` | Increment the selected item's quantity by 1. |
| `−` | Decrement the selected item's quantity by 1. If quantity reaches 0, the item is removed from the cart. |

---

#### On-Screen Tender Button

The large **TENDER** button on the right panel (below the totals summary) is the primary checkout trigger. Clicking it opens the Tender dialog defaulting to **Cash** (or the first configured payment method). It is disabled when the cart is empty.

The totals summary panel above the Tender button displays a live breakdown:

| Field | Description |
|-------|-------------|
| **Total Amount Due** | Large primary display — net amount after all discounts. |
| **Sub Total** | Net total after item-level discounts. |
| **Vat Sales** | VATable portion of the sale (exclusive of 12% VAT). |
| **Sub Discount** | Total discount amount applied across all items. |
| **Vat Amount** | 12% VAT computed on VATable items. |
| **Amount Due** | Final amount the customer must pay. |
| **Non-VAT Sales** | Revenue from Non-VAT items. |
| **VAT-Exempt Sales** | Revenue from VAT-exempt items. |
| **Zero-Rated Sales** | Revenue from zero-rated items. |
| **No. of Items** | Total quantity of all items in the cart. |

---

#### Quick Reference Card

```
┌─────────────────── HEADER BAR (F-Keys) ──────────────────────────────┐
│  F1 Edit Item │ F2 Line Void │ F3 Discount │ F4 Suspend              │
│  F5 Suspended │ F6 Quantity  │ F7 Edit Price│ F8 Endorse/Out          │
├─────────────────── KEYBOARD ONLY ─────────────────────────────────────┤
│  F9 Product Search   │ F10 Credit Card  │ F11 E-Wallet │ F12 Points  │
│  Enter → Add Item (if SKU typed) or Tender (if input empty)          │
├─────────────────── FOOTER BAR (Ctrl+Keys) ────────────────────────────┤
│  Ctrl+1 Cash Count  │ Ctrl+2 Cash Transfer │ Ctrl+3 Customer         │
│  Ctrl+4 Loyalty     │ Ctrl+5 Recent Sales  │ Ctrl+6 Post Void        │
│  Ctrl+7 Merch Credit│ Ctrl+0 Z-Reading     │ Ctrl+P Price Inquiry    │
├─────────────────── CART NAVIGATION ───────────────────────────────────┤
│  ↑/↓ Navigate items │ +/− Adjust quantity                            │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dashboard

**Route:** `/dashboard`  
**Access:** Admins, Managers (requires `view_dashboard` permission).

The Dashboard is the first screen seen after logging into the backoffice. It provides a real-time, at-a-glance overview of the business's operational health. All data is fetched live on page load and can be refreshed manually.

| Widget | Description | Business Value |
|--------|-------------|----------------|
| **Hourly Sales Chart** | Bar chart showing today's sales revenue broken down by hour (e.g., 8 AM, 9 AM…). | Identify peak and slow hours to optimize staffing. |
| **Monthly Sales Pie Chart** | Donut/pie chart showing the revenue contribution of each product **category** for the current month. | Understand which product lines drive the most revenue. |
| **Sales by Category Chart** | Comparative grouped bar chart across multiple categories for the current period. | Side-by-side category performance comparison. |
| **Top Selling Products** | Ranked list of the highest-revenue products, showing units sold and total revenue. | Fast-moving product visibility for reorder planning. |
| **Supplier Schedule Card** | Displays upcoming expected delivery dates from active suppliers based on configured order schedules. | Proactively prepare for incoming stock. |
| **Low Stock Notification Bell** | Real-time notification badge showing the count of products at or below their reorder points. Clickable to navigate to the Low Stock report. | Prevent stockouts before they happen. |

---

## 3. Products

**Route:** `/products`  
**Access:** Requires `manage_products` permission.

The Products module is the central catalog that defines every item sold in the store. Changes here affect POS pricing, inventory tracking, and purchase order pricing.

---

### 3.1 Product Attributes

Every product in Alon POS carries the following data fields:

| Field | Description |
|-------|-------------|
| **Name** | Primary display name shown in POS, receipts, and reports. |
| **Description** | Short description visible in product detail views and some receipt formats. |
| **Additional Description** | Extended notes, specifications, or secondary description line. |
| **SKU** | Stock Keeping Unit — unique internal identifier used for inventory tracking. |
| **Barcode** | Scannable barcode (EAN-13, Code 128, etc.). Can differ from SKU. Used by the POS barcode scanner. |
| **Category / Subcategory** | Two-level classification. Used for report grouping, markup hierarchy resolution, and dashboard charts. |
| **Brand** | Product brand. Part of the markup priority hierarchy. |
| **Department** | Organizational grouping used for reporting segments. |
| **Unit of Measure (UOM)** | The base selling unit (e.g., Piece, Box, Kilogram, Liter). Displayed on receipts. |
| **Price (Retail)** | The standard retail selling price shown in the POS. |
| **Cost** | Purchase cost used for margin and profit calculations in reports. Not shown to customers. |
| **VAT Status** | Determines how tax is applied: `VAT` (12% added), `NON-VAT`, `Zero-Rated` (0% VAT on zero-rated exports), `VAT-Exempt` (exempt by law). BIR-compliant tax segregation on receipts. |
| **Reorder Point** | The stock level at which a low-stock alert is triggered and the product appears in the Low Stock Report. |
| **Warehouse Assignment** | Links the product to a physical warehouse location for multi-warehouse environments. |
| **Shelf Location(s)** | One or more shelf assignments within the warehouse. Each shelf can have its own sub-quantity for granular bin-level tracking. |
| **Expiration Date** | Optional expiry date for perishable or time-sensitive products. |
| **Earns Points** | Toggle that controls whether this product contributes loyalty points on POS purchase. Products like alcohol or tobacco can be excluded from earning. |

---

### 3.2 Product Family (Parent–Child Hierarchy)

Alon POS supports a **three-level product tree** to handle unit-of-measure conversions automatically:

```
Bulk (Parent)
├── Pack (Child)       — e.g., 1 Pack of 6 Pcs
└── Retail (Child)     — e.g., 1 Piece
    └── Variant (Grandchild) — optional further split
```

**How it works:**

- Each child product has a `conversionFactor` (e.g., 1 Box = 24 Pieces, so conversionFactor = 24).
- When stock is received at the **bulk level** (e.g., 10 boxes received via a Purchase Order), the system automatically syncs the equivalent quantity to all child products using the conversion factor.
- Similarly, a stock adjustment on the parent propagates down the tree recursively.
- This eliminates the need to manually update each variant when bulk stock changes.

**Use Case:** Your supplier sells "Coke 1.5L" by the case (24 bottles). You receive at the case level, but you sell individual bottles at the POS. The family hierarchy handles the conversion automatically.

---

### 3.3 Price Levels

Price Levels allow businesses to offer **differentiated pricing** to different customer segments without maintaining separate product catalogs.

Each Price Level defines:

| Setting | Description |
|---------|-------------|
| **Name** | Label for the tier (e.g., Wholesale, Dealer, Walk-in, VIP). |
| **Base Calculation** | Whether the adjustment is applied to `retail` price or `cost`. |
| **Percentage Adjustment** | The markup or discount percentage relative to the base (e.g., −10% for wholesale). |
| **Minimum Quantity** | Optional: the price level only activates when the cart line quantity meets this threshold. |

Customers are assigned a Price Level in the Customer module. When that customer is selected at the POS, their tier pricing is applied automatically to all eligible items.

---

### 3.4 Supplier Mapping

A single product can be procured from **multiple suppliers** with different costs and terms. Each supplier mapping stores:

| Field | Description |
|-------|-------------|
| **Supplier** | The linked supplier record. |
| **Supplier Cost** | The negotiated unit cost from this specific supplier. |
| **Lead Time (days)** | Average days from order to delivery for this supplier. |
| **Reorder Point (ROP)** | Supplier-specific minimum stock threshold before reordering from this supplier. |
| **Primary Supplier Flag** | Marks one supplier as the default for auto-generated purchase suggestions. |

---

### 3.5 Automatic Markup (Suggested Selling Price)

The **Magic Wand (✦)** button, available in both the Purchase Order dialog and the Product edit dialog, automatically calculates a suggested retail price using this formula:

```
Suggested Price = (Cost × (1 + Markup%)) + Shipping Allocation
```

The system resolves the **Markup%** by looking up the following hierarchy in order (first non-zero value wins):

1. **Subcategory markup** — most specific, takes highest priority
2. **Category markup** — one level up from subcategory
3. **Brand markup** — brand-level default
4. **Supplier markup** — the purchasing supplier's default markup
5. **Global default markup** — configured in Settings, lowest priority fallback

The matching is **case-insensitive and whitespace-tolerant** to avoid configuration mismatches.

**Shipping Allocation** distributes the purchase order's shipping cost across items proportionally to their line value (landed cost method).

---

### 3.6 Product Views

| View | Description |
|------|-------------|
| **Card View** | Visual tile layout. Each card shows the product image (if any), name, SKU, barcode, current stock badge (color-coded: green = OK, red = low stock), and an action dropdown menu. |
| **Table View** | Compact spreadsheet-style data table with all key fields in columns. Better for scanning through large catalogs quickly. |
| **Low Stock Filter** | One-click filter that instantly narrows the view to only products at or below their configured reorder point, aiding quick replenishment decisions. |

---

## 4. Inventory

**Route:** `/inventory`  
**Access:** Requires `manage_inventory` permission.

The Inventory module tracks the physical quantity of products across all warehouses and shelf locations. It provides tools for manual corrections, physical counts, unit conversions (repackaging), and visual shelf organization.

---

### 4.1 Stock Levels

The main inventory grid displays **real-time stock quantities** for all products. Features:

- **Card / Table View Toggle** — same dual-view options as the Products module.
- **Barcode Search** — quickly locate a product by scanning its barcode.
- **Bulk Adjustment Drawer** — adjust multiple products' stock in a single batch operation.
- **Inline Adjustment** — click a product to open a quick adjustment popup for that specific product.

Stock totals are maintained by the system automatically when:
- A POS sale is completed (stock decrements)
- A Purchase Order is received (stock increments)
- A manual Stock Adjustment is submitted
- A Repackaging operation is processed
- A Return / Merchandise Credit is processed (stock increments)

---

### 4.2 Stock Adjustment

When physical stock does not match the system record, a manual correction can be submitted:

| Field | Description |
|-------|-------------|
| **Add / Remove Tab** | Two-tabbed interface: "Add" increments stock; "Remove" decrements it. |
| **Quantity** | The number of units to add or remove. |
| **Reason** | Pre-defined reason codes: Damaged, Expired, Found, Correction, Theft, Miscounted, Other. A custom reason text field is also available. |
| **Projected Impact Preview** | Real-time display showing the **resulting stock level** after the adjustment is applied. Helps prevent accidental over-correction. |

If the `requireAdjustmentConfirmation` setting is enabled, the adjustment is **not applied immediately**. Instead, it is routed to the **Approvals Board** where an authorized user must review and approve it before the stock changes take effect.

---

### 4.3 Stock Counts (Physical Inventory Snapshots)

A Stock Count is a formal **physical inventory reconciliation** process that compares what the system expects versus what was physically counted.

**Full Workflow:**

1. **Create Count** — Staff initiates a new count session. The system records a snapshot of the current expected quantities for all (or selected) products.
2. **Enter Counted Quantities** — Warehouse staff physically counts items and enters the physically-counted quantities per product.
3. **Variance Calculation** — The system computes: `Variance = Counted Quantity − Expected Quantity`. Positive = surplus found; Negative = shortage.
4. **Review Variances** — Staff can review discrepancies before applying.
5. **Apply Count** — Confirms the adjustments. Stock levels are updated to match the physical count.
6. **Approval Gate (Optional)** — If `requireStockCountApproval` is enabled, Step 5 is deferred until an authorized approver signs off on the count.

---

### 4.4 Repackaging (REPACKING)

Repackaging handles the physical conversion of inventory between levels in a **Product Family**. Two directions are supported:

#### Break Pack (Bulk → Retail / Smaller Units)

Used when splitting a bulk quantity into smaller sellable units.

**Workflow:**
1. Select the **parent/bulk product** (e.g., "1 Box of 24 Pcs") and specify the number of boxes to break.
2. System calculates the resulting child quantity: `Child Qty = Boxes × Conversion Factor`.
3. Optionally auto-generate a barcode and calculate a new cost/price for the child units.
4. Submit → Parent stock **decrements**; child stock **increments**.

#### Consolidation (Retail / Pack → Bulk)

The reverse: consolidate smaller units back into bulk packaging.

**Workflow:**
1. Select the **child/pack product** and the quantity to consolidate.
2. System calculates the resulting bulk quantity: `Bulk Qty = Pack Qty ÷ Conversion Factor`.
3. Submit → Child stock **decrements**; parent stock **increments**.

Both operations can be queued for approval if `requireRepackagingConfirmation` is enabled.

---

### 4.5 Stock Transfers (Bulk Adjustment)

Moving stock, between shelves or between warehouses, is done on the single **Bulk Adjustment** page (**Inventory → Bulk Adjustment**). The former Shelf Board and Transfer Board screens no longer exist; their functions are covered here.

The page has three modes under **Adjustment Mode**: **Add**, **Remove** and **Transfer**. Inside **Transfer**, the **Transfer To** toggle chooses the kind of destination. Each batch has one source and one destination, and every product in the batch moves from that source to that destination.

| Transfer To | Source / Destination | What changes |
|-------------|---------------------|--------------|
| **Warehouse** | Source Warehouse, Destination Warehouse | Stock leaves the product in the source warehouse and is added to the matching product in the destination warehouse. Approval type: `STOCK_TRANSFER` (setting `requireTransferConfirmation`). |
| **Shelf** | Source Shelf, Destination Shelf (either may be *Unassigned*) | The `product_shelves` assignments are moved by the chosen quantity. A product's **total stock never changes** in a shelf transfer. Approval type: `SHELF_TRANSFER` (setting `requireShelfTransferApproval`). |

**Notes:**

- In shelf mode the quantity limit is the amount sitting on the **source shelf**, not the product's total stock. Only products that have stock on the source shelf can be added. For *Unassigned*, the limit is total stock minus the quantity assigned to shelves.
- Quantity is explicit per product, so partial moves are possible (for example, 3 of 10 units from one shelf to another).
- The two approval types are separate: when the relevant setting is enabled, the transfer is queued on the Approvals Board instead of being applied immediately.
- The old drag-and-drop Kanban interface was removed; shelf moves are now made with the source/destination pickers above.

---

### 4.6 Adjustment History

A **paginated log** of all historical stock adjustment entries. Each entry records:

- Date and time of adjustment
- Product name and SKU
- Adjustment type (Add / Remove)
- Quantity changed
- Reason code
- User who performed the adjustment

Useful for auditing unexplained stock discrepancies.

---

### 4.7 Stock Movement Log

The most detailed audit trail in the system. Every single change to a product's stock level — from any source — is recorded here:

| Field | Description |
|-------|-------------|
| **Product Name** | The affected product. |
| **Movement Type** | Sale, Purchase Receipt, Adjustment, Return, Transfer, Repackaging. |
| **Quantity Change** | The signed delta (e.g., −3 for a sale of 3 units, +12 for a receipt). |
| **Previous Stock** | Stock level before the movement. |
| **New Stock** | Stock level after the movement. |
| **Reference ID / Type** | The linked source document (e.g., POS transaction ID, Purchase Order ID). |
| **Timestamp** | Date and time the movement occurred. |

This log cannot be deleted or edited, providing a tamper-evident audit trail for inventory reconciliation and loss prevention.

---

## 5. Sales

**Route:** `/sales`  
**Access:** Requires `view_sales` permission.

The Sales module aggregates all revenue data from POS transactions, backoffice sales orders, and invoices into a unified view for analysis and management.

---

### 5.1 POS Sales Transactions

A complete list of every POS transaction processed across all terminals.

**Filters available:**
- Date range (single date or range picker)
- Specific cashier / user
- Terminal
- Payment method
- Void status

**Per-transaction actions:**
- **Drill-down** — click any transaction to view the full line-item breakdown, discounts, payment method split, and receipt details.
- **Reprint Receipt** — regenerate and print the original receipt, thermal or PDF.
- **Void Transaction** — cancel the sale (creates a matching void record; original is preserved).

---

### 5.2 Sales by Product / Service

Aggregates all POS sales data **grouped by product**, showing:

| Column | Description |
|--------|-------------|
| **Product Name / SKU** | The item sold. |
| **Total Units Sold** | Gross quantity sold across the selected period. |
| **Gross Revenue** | Total revenue before discounts. |
| **Net Revenue** | Revenue after discounts. |
| **VAT Amount** | Tax collected. |
| **Cost** | Estimated total cost based on product cost. |
| **Profit Margin** | Gross profit percentage (shown when cost data is available). |

Used for identifying best-sellers, slow-movers, and margin performance.

---

### 5.3 Sales by Date

Summarizes sales totals **grouped by calendar date**. Each row shows the day's gross revenue, transaction count, and average transaction value. Useful for identifying day-of-week or seasonal patterns.

---

### 5.4 Sales Orders

Backoffice-created **formal sales orders** (non-POS). Designed for B2B or pre-order workflows where the delivery happens separately from the invoice.

| Field | Description |
|-------|-------------|
| **Customer** | Linked customer account. |
| **Delivery Date** | Expected date of product delivery. |
| **Sales Person** | Assigned sales representative. |
| **Line Items** | Products, quantities, unit prices. |
| **Status** | `Pending` → `To Deliver` → `Partially Delivered` → `Fully Delivered`. |

Status transitions trigger inventory allocation and eventually stock decrement when delivery is confirmed.

---

### 5.5 Sales Invoice / Delivery

Formal invoices generated from Sales Orders. Each invoice includes:

- Invoice date and due date
- Itemized product list with unit prices and amounts
- VAT breakdown
- Payment status tracking (Unpaid / Partially Paid / Paid)
- Export functionality (PDF or CSV)

---

### 5.6 Merchandise Credits (Returns)

A **Merchandise Credit** is issued when a customer returns purchased goods.

**Initiation:** Via the POS Return Dialog (during the same shift) or from the backoffice Sales module.

**Process:**
1. Select the original transaction.
2. Choose which items (and quantities) are being returned.
3. Select the refund method: cash refund, card reversal, or store credit.
4. System generates a **Credit Slip receipt** (printable) and reverses the stock decrement.

The credit is recorded in the customer's account if returned as store credit, reducing their outstanding balance.

---

### 5.7 Post Void

Voids a transaction **after** the shift has ended or on the next business day (when the same-day Void Transaction is no longer available). Requires a documented reason. The original transaction is marked as VOID in the database and excluded from revenue totals.

---

### 5.8 POS Z-Reading

Official end-of-day report per terminal. See [Section 1.5](#15-x-reading--z-reading) for detailed breakdown. Key fields shown:

- Gross Sales, Net Sales, VAT Amount
- Zero-Rated and VAT-Exempt sales totals
- Payment method breakdown (Cash, Card, GCash, etc.)
- Total Discounts (SC/PWD, custom, others)
- Return totals
- Net Amount Due
- Opening fund and expected cash-in-drawer
- Transaction range (first to last OR number)
- Running Grand Total (cumulative Z-counter total)
- BIR fields: MIN, Serial Number, TIN

---

### 5.9 POS X-Reading

Mid-shift summary showing the **current shift totals** without closing it. All the same fields as Z-Reading but without incrementing the Z-counter. Printable on demand.

---

### 5.10 Sales Analysis

A collection of analytical sub-reports for deeper insight:

| Sub-Report | Description |
|------------|-------------|
| **Batch Profit** | Profit calculated per inventory batch. Matches the cost from the specific receiving event (batch) to the revenue from sales attributed to that batch. |
| **Hourly Sales Distribution** | Aggregated hourly sales pattern across a date range (useful for staffing decisions). |
| **Monthly Category Breakdown** | Month-by-month revenue by product category. |
| **Top Products Report** | Ranked list of highest-revenue or highest-volume products. |

---

### 5.11 POS Cash Transfer

Records **mid-shift cash movements** to and from the POS drawer:

| Type | Description |
|------|-------------|
| **Pickup** | Cash removed from the drawer and transferred to a safe (reduces expected cash-in-drawer). |
| **Deposit** | Cash added to the drawer (e.g., petty cash for change). Increases expected cash. |

Both are logged with amount, reason text, and timestamp, and appear in the X/Z readings' cash reconciliation section.

---

### 5.12 Management Dialogs (Sales Module)

| Dialog | Purpose |
|--------|---------| 
| **Manage Customers** | Quick access to add or edit customer records without leaving the Sales module. |
| **Manage Payment Methods** | Configure the list of tender types available at the POS (add, rename, enable/disable). |
| **Manage Sales Persons** | Maintain the roster of sales representatives that can be assigned to customers and sales orders. |
| **Manage Warehouses** | Configure warehouse locations that appear in purchase orders and inventory management. |

---

## 6. Purchases

**Route:** `/purchases`  
**Access:** Requires `manage_purchases` permission.

The Purchases module manages the complete purchase order lifecycle — from creation and sending to suppliers, through receiving goods, through payment. It ties directly into inventory (goods received increment stock) and supplier balances (amounts due increment the supplier's payable balance).

---

### 6.1 Purchase Orders

Purchase Orders (POs) move through the following statuses:

| Status | Description |
|--------|-------------|
| **Draft** | The PO has been created but not yet finalized or sent to the supplier. Can be freely edited. |
| **Ordered** | The PO has been submitted/sent to the supplier. Goods are awaited. |
| **Partially Received** | Some but not all ordered lines have been received. Stock was incremented for received items only. |
| **Received** | All lines fully received. Inventory updated. Supplier payable balance increased. |
| **Cancelled** | The PO was voided before receipt. No stock impact. |

**Key Features in Detail:**

#### Add Purchase Order Dialog

A multi-step modal for creating a new PO:
- Select the **supplier** (auto-populates payment terms and due date calculation).
- Enter the **issue date** and **warehouse destination**.
- Add line items: product SKU/name, order quantity, unit cost, line discount (%), and VAT type.
- The **subtotal per line** and **grand total** are calculated live.
- **Suggested Selling Price (Wand ✦)** — per line item, applies the markup hierarchy (see [3.5](#35-automatic-markup-suggested-selling-price)) to suggest a new retail price, which can be saved back to the product catalog.
- **Shipping Cost** — a single shipping charge field. The amount is **distributed proportionally** across all line items by their value (landed cost calculation), affecting each item's effective unit cost.

#### Due Date Auto-Calculation

When a supplier is selected, the system reads the supplier's **payment terms** (e.g., "Net 30", "COD", "Net 15 days") and automatically calculates the **due date** by parsing the term and adding the appropriate number of calendar days to the issue date. The cashier can still manually override the due date.

#### Receive PO Dialog

When goods arrive:
1. Open the Receive PO dialog for the target PO.
2. For each line item, enter the **actually received quantity** (may be less than ordered for partial receipts).
3. System records the receipt, decrements the outstanding ordered quantity, increments product stock, and updates the PO status.
4. If `requireReceivePOConfirmation` is enabled, the receipt is queued for approval before stock is updated.

#### Scheduled Orders

View a calendar or list of upcoming expected delivery dates from all active POs. Helps with receiving bay scheduling.

#### Print / Export

- **Print Purchase Order** — thermal or A4 PDF format with supplier details, line items, and totals.
- **Export to CSV** — full purchase order data for external processing or reporting.

---

### 6.2 Bad Orders

Tracks problems with received goods — items that arrived defective, damaged, expired, or incorrect.

| Field | Description |
|-------|-------------|
| **Linked PO** | The purchase order this bad order is associated with. |
| **Product** | The specific product with the issue. |
| **Quantity Affected** | Number of defective units. |
| **Reason** | `Damaged` / `Defective` / `Expired` / `Wrong Item` / `Missing` / `Other`. |
| **Status** | `Reported` → `Return Requested` → `Replaced` / `Credited` / `Resolved`. |
| **Resolution Notes** | Free-form text field for follow-up documentation (e.g., "Supplier agreed to credit next PO"). |

If `requireBadOrderConfirmation` is enabled, bad order submissions are routed through the Approvals Board before becoming official.

---

## 7. Customers

**Route:** `/customer`  
**Access:** Requires `manage_customers` permission.

The Customers module manages all accounts for individuals and businesses that purchase from the store — both POS walk-in customers and credit/charge account customers.

---

### 7.1 Customer List

The master customer database. Each customer record contains:

| Field | Description |
|-------|-------------|
| **Name** | Full customer name (individual or business). |
| **Contact Number** | Primary phone number. |
| **Address** | Delivery address. |
| **Billing Address** | Invoice/billing address (may differ from delivery). |
| **TIN** | Tax Identification Number for invoice generation on B2B accounts. |
| **Assigned Sales Person** | The sales representative responsible for this account. |
| **Sales Area** | Geographic or organizational territory. |
| **Sales Group** | Customer grouping for reporting segmentation. |
| **Payment Terms** | e.g., COD, Net 30. Determines due date on sales invoices. |
| **Credit Limit** | Maximum outstanding balance allowed before further credit sales are blocked. The system warns or blocks when a sale would exceed this limit. |
| **Assigned Price Level** | The tier pricing applied automatically when this customer is selected at the POS (e.g., Wholesale, Dealer). |
| **Discount (%)** | A default discount percentage applied to all this customer's purchases. |
| **SR/PWD Flag** | Marks the customer as a Senior Citizen or PWD for automatic statutory discount eligibility. |

**Delete Protection:** When attempting to delete a customer, the system checks whether they have any linked transactions (sales orders, payments, loyalty records). If they do, deletion is **blocked** with a specific message listing the transaction types, preventing orphaned data.

---

### 7.2 Customer Payments

Records direct **payments received** from customers against their outstanding invoice balances. Each payment entry includes:

- Customer account
- Payment amount
- Payment method
- Reference number (check number, transfer reference, etc.)
- Date received
- Notes

Payments reduce the customer's outstanding balance in real time.

---

### 7.3 Customer Balances

A **Statement of Account (SOA)** view for each customer showing all outstanding invoices, applied payments, and the net outstanding balance. This is printable as a formal SOA document for billing and collection purposes.

---

### 7.4 Customer Loyalty Points

Alon POS includes a built-in loyalty program:

| Feature | Description |
|---------|-------------|
| **Earn Points** | Customers earn points on qualifying POS purchases. The earning rate (e.g., ₱1 spent = 1 point) is configurable globally. Individual products can be excluded from earning (toggle in Product settings). |
| **Point History Log** | Every earn and redeem event is logged with date, transaction reference, points earned/redeemed, and running balance. |
| **Manual Adjustment** | Administrators can manually add or deduct points from a customer's account with a reason note (e.g., return correction, promotional grant). |
| **Redeem at POS** | During checkout, if a customer is attached to the transaction, the cashier can apply some or all of the customer's points as a payment/discount. The redemption rate (e.g., 100 points = ₱1) is configured in Loyalty Settings. |
| **Loyalty Card** | A physical loyalty card can be issued per customer (via Add Loyalty Card dialog). The card links to the customer's digital loyalty account. |
| **Tier Thresholds** | Optional tiering (e.g., Silver at 1,000 points, Gold at 5,000 points) with different earning multipliers per tier. |
| **Expiry Rules** | Points can be configured to expire after a set number of days of inactivity. |

---

## 8. Suppliers

**Route:** `/suppliers`  
**Access:** Requires `manage_suppliers` permission.

The Suppliers module manages all vendor/supplier accounts and provides accounts-payable tracking for amounts owed from purchase orders.

---

### 8.1 Supplier List

The master supplier database. Each record contains:

| Field | Description |
|-------|-------------|
| **Company Name** | Official business name of the supplier. |
| **Contact Person** | Primary point of contact. |
| **Phone / Mobile** | Contact numbers. |
| **Email** | Email for PO communication. |
| **Address** | Physical address. |
| **TIN** | Supplier's Tax Identification Number for BIR documentation. |
| **Payment Terms** | Default payment terms (e.g., Net 30, COD). Used to auto-calculate PO due dates. |
| **Default Markup %** | The supplier-level markup percentage used in the Suggested Selling Price hierarchy (lowest priority before Global Default). |
| **Order Schedule** | Configured delivery schedule (e.g., every Monday, bi-weekly). Displayed on the Dashboard Supplier Schedule card. |

---

### 8.2 Balance to Supplier (Accounts Payable)

Tracks what the business **owes to each supplier** based on received purchase orders that have not been fully paid.

Per supplier, the balance view shows:

- Total outstanding balance
- History of individual **purchase transactions** (POs received)
- History of **payments made** to the supplier
- **Add Transaction** — manually add a charge or adjustment entry
- **Add Payment** — record a payment made to the supplier

The balance updates automatically when a PO status changes to "Received."

---

### 8.3 Supplier Payments

Records of all payments made to suppliers:

- Amount paid
- Payment date
- Payment reference (check number, bank transfer ID)
- Linked PO(s)

Each payment entry can be printed as a **Payment Voucher** — a formal document for accounting records. Supplier payment history can also be exported to **CSV** for integration with external accounting software.

---

## 9. Approvals Board

**Route:** Accessed via sidebar drawer (Management section)  
**Access:** Requires `view_approvals` permission to view; `manage_approval_settings` to configure.

The Approvals Board is a **multi-level authorization workflow** system that prevents unauthorized changes to critical inventory and purchasing records. It uses a Kanban-style board interface.

---

### 9.1 Supported Approval Types

| Approval Type | What It Controls | Enabling Setting |
|---------------|-----------------|------------------|
| **Stock Adjustment** | Manual stock corrections | `requireAdjustmentConfirmation` |
| **Stock Count** | Physical inventory count application | `requireStockCountApproval` |
| **Purchase Order** | New PO creation | `requirePurchaseOrderConfirmation` |
| **Receive PO** | Recording goods receipt | `requireReceivePOConfirmation` |
| **Bad Order** | Bad order recording | `requireBadOrderConfirmation` |
| **Repackaging** | Break Pack and Consolidation operations | `requireRepackagingConfirmation` |
| **Shelf Transfer** | Shelf-to-shelf transfers made from Bulk Adjustment (Transfer → Shelf) | `requireShelfTransferApproval` |
| **Stock Transfer** | Warehouse-to-warehouse transfers made from Bulk Adjustment (Transfer → Warehouse) | `requireTransferConfirmation` |

---

### 9.2 Approval Workflow

```
Submitted → Level 1 Review → Level 2 Review (optional) → Approved → Finalized
                                                         └─────────→ Rejected
```

**Board Columns:** Each Kanban column represents a stage. Cards (approval requests) move left to right as they progress.

**Level 1 Review:** A designated Level 1 approver reviews the request and either approves it (moves to Level 2 or directly to Approved) or rejects it (with a rejection reason).

**Level 2 Review (Optional):** Configured for decisions requiring a second sign-off (e.g., high-value purchase orders).

**Approved:** The system automatically applies the underlying operation (e.g., the stock adjustment takes effect, the PO is marked as received, the shelf assignment changes).

**Rejected:** The original submitter is notified. The underlying operation is not applied. A rejection reason is recorded.

---

### 9.3 Workflow Configuration

Configured under Settings → POS Setup → Transaction Confirmations:

- **Enable / disable** each approval type individually.
- **Assign approvers** per level (users with the appropriate role and permission).
- **Configure multi-level** depth (Level 1 only vs. Level 1 + Level 2).

---

## 10. Reports

**Route:** `/reports`  
**Access:** Requires `view_reports` permission.

All reports support date range filtering and can be exported to CSV unless otherwise noted.

| Report | Description | Key Use Case |
|--------|-------------|--------------|
| **Inventory Report** | Current stock quantity and value (stock × cost) by product. Grand total inventory value in pesos. | Balance sheet inventory valuation. |
| **Stock Adjustments** | Historical log of all manual stock adjustment entries — who, what, when, and why. | Audit trail for shrinkage and loss. |
| **Stock Movements** | Full movement log: every sale, purchase, adjustment, return, and transfer. | Reconcile stock discrepancies, trace anomalies. |
| **Low Stock Report** | All products currently at or below their configured reorder point, with reorder quantities. | Generate purchase orders for replenishment. |
| **Purchase Report by Product** | Total quantities ordered and received per product across all suppliers. Total cost spent per product. | Identify high-spend products and verify supplier deliveries. |
| **Purchase Report by Supplier** | Total spend per supplier over the selected period. | Supplier spend analysis and negotiation support. |
| **Sales Velocity** | Average units sold per day and per week for each product. Helps forecast how many days of stock remain at the current sell rate. | Reorder timing and safety stock calculations. |
| **Batch Profit Report** | Profit per inventory batch — matches the specific cost event (the PO receipt) with the revenue generated from that batch's sales. | True costing when prices fluctuate across POs. |
| **Statement of Account (SOA)** | Customer or supplier SOA showing all transactions, payments, and outstanding balance over a period. Printable. | Billing, collections, and accounts payable reconciliation. |

---

## 11. User Management

**Route:** `/user-management`  
**Access:** Requires `manage_users` permission. Only Super Admins and Admins can access by default.

---

### 11.1 Users

The Users sub-module manages individual system accounts:

| Action | Description |
|--------|-------------|
| **Add User** | Create a new user with name, username, email, and initial password. Assign a User Type. |
| **Edit User** | Update user details or change their assigned User Type. |
| **Deactivate User** | Soft-deactivates the account (login is blocked). The user's historical records (sales, adjustments, etc.) are preserved. |
| **Change Password** | Reset a user's password. Passwords are stored as **bcrypt hashes** — plaintext is never retained. |

---

### 11.2 User Types & Permissions

User Types define the **permission set** for a group of users. Built-in roles:

| Role | Default Access |
|------|----------------|
| **Super Admin** | All permissions. Bypasses all permission checks. Intended for system administrators and developers only. |
| **Admin** | Full backoffice access. Can perform all POS administrative actions (void, price edit, shift management). |
| **Manager** | Access to Inventory, Sales, Purchases, and Reports. Cannot manage users or settings by default. |
| **Cashier** | Access to POS terminal only. On login, they are automatically redirected to `/pos`. They cannot access the backoffice. |

**Custom User Types:** Any number of additional user types can be created with granular per-permission toggles. This allows businesses to create roles like "Receiving Clerk" (inventory only), "Purchasing Officer" (purchases only), or "Warehouse Staff" (inventory + transfers).

---

### 11.3 Permission Reference

| Permission ID | Label | Controls |
|--------------|-------|----------|
| `access_pos` | Access Point of Sale | Allow login to the POS terminal |
| `view_dashboard` | View Dashboard | Access the `/dashboard` route |
| `manage_products` | Manage Products | Create, edit, delete products |
| `manage_inventory` | Manage Inventory | Stock adjustments, transfers, counts, repackaging |
| `view_sales` | View Sales | View POS transactions and sales reports |
| `manage_purchases` | Manage Purchases | Create and manage purchase orders |
| `manage_customers` | Manage Customers | Add, edit, delete customer records |
| `manage_suppliers` | Manage Suppliers | Add, edit, delete supplier records |
| `view_reports` | View Reports | Access the Reports module |
| `view_approvals` | View Approvals Board | View the Approvals Kanban board |
| `manage_approval_settings` | Manage Approval Settings | Configure approval workflows and assign approvers |
| `manage_users` | Manage Users | Create and manage user accounts and user types |
| `manage_settings` | Manage Settings | Access all Settings sub-pages |

> **Note:** `super_admin` is a special flag that bypasses all individual permission checks. It should be assigned only to the Super Admin user type.

---

## 12. Settings

**Route:** `/settings`  
**Access:** Requires `manage_settings` permission.

---

### 12.1 POS Setup (`/settings/pos-setup`)

The central configuration page for operational and compliance behavior.

#### Business Profile

Business identity information printed on all receipts and invoices:

| Field | Notes |
|-------|-------|
| **Business Name** | Legal or trade name of the establishment. |
| **Operated By** | Name of the registered owner or operator (BIR requirement). |
| **Address** | Full business address as registered with BIR. |
| **Contact Number** | Business phone, shown on receipts. |
| **TIN** | BIR Tax Identification Number — printed on all official receipts. |
| **Email** | Business email. |
| **Logo** | Upload a PNG/JPG logo (max 2 MB) displayed in the receipt header when printing in browser mode. |

---

#### Printer Configuration

| Setting | Options | Notes |
|---------|---------|-------|
| **Paper Size** | 58 mm / 80 mm | Match to your thermal paper roll width. |
| **Print Mode** | Browser Print / Native DLL | Browser Print uses installed driver; Native DLL calls Windows Spooler directly via `winspool.drv`. |
| **Native Printer** | Dropdown of installed printers | Available only in Native DLL mode. Scan and select from Windows-registered printers. |
| **Print Two Receipts** | On / Off | Automatically print a duplicate copy on every tender. |

---

#### General Settings

| Setting | Description |
|---------|-------------|
| **Show Quantity in POS Search** | When enabled, the Product Search dialog displays each item's current stock quantity alongside its name. Helps cashiers advise customers about availability. |
| **Allow Negative Inventory** | When enabled, the POS allows completing a sale even if the product has zero or negative stock (overselling). When disabled, the sale is blocked. |

---

#### Transaction Confirmations (Approval Gates)

Each toggle routes the corresponding transaction type through the Approvals Board workflow. When disabled, the transaction applies immediately without review.

| Toggle | Affected Transactions |
|--------|-----------------------|
| **Stock Adjustment Confirmation** | Manual stock add/remove |
| **Stock Transfer Confirmation** | Warehouse-to-warehouse transfers (Bulk Adjustment → Transfer → Warehouse) |
| **Purchase Order Confirmation** | New PO creation |
| **Receive PO Confirmation** | Recording goods receipt from a PO |
| **Bad Order Confirmation** | Recording a bad order |
| **Stock Count Approval** | Applying a physical stock count |
| **Repackaging Approval** | Break Pack and Consolidation operations |
| **Shelf Transfer Approval** | Shelf-to-shelf transfers (Bulk Adjustment → Transfer → Shelf) |

---

#### Batch Costing Policy

| Setting | Description |
|---------|-------------|
| **Inherit Batch Cost When Repacking** | When enabled, child products created via Break Pack inherit their cost from the parent batch: `Child Cost = Parent Cost ÷ Conversion Factor`. When disabled, child products retain their existing catalog cost. |
| **Block Sale When Batch Stock Exhausted** | Prevents the POS from selling units once the tracked batch quantity for that product reaches zero, even if the system-level stock count is greater. Enforces strict batch-level FIFO. |

---

#### BIR Compliance (RMO 24-2023)

Settings required for compliance with BIR Revenue Memorandum Order 24-2023:

| Setting | Description |
|---------|-------------|
| **Training Mode** | Tags all transactions as "Training" — they are excluded from Z-reading totals and official reports. A visual banner is shown in the POS during training mode. |
| **Machine Identification Number (MIN)** | BIR-issued number unique to the fiscal machine. Printed on every OR and Z-Reading. |
| **Serial Number** | Hardware or software serial number of the POS system. BIR-mandated on reports. |
| **Transaction Prefix** | Optional alpha prefix prepended to OR numbers (e.g., "OR-" → "OR-000001"). |

---

#### Authentication Guards

Enable or disable individual PIN/credential prompts for sensitive POS actions:

| Guard | Action Protected |
|-------|------------------|
| **Line Void Auth** | Removing a line item from the cart |
| **Void / Return Auth** | Voiding a completed transaction or processing a return |
| **Recent Sales Auth** | Viewing and reprinting previous transactions (F8) |
| **Price Edit Auth** | Overriding an item price (F7) |
| **Edit Item Auth** | Editing an item's name in the cart (F1) |
| **Suspend Auth** | Suspending (holding) the current transaction (F4) |
| **Suspended Auth** | Viewing the list of suspended/held transactions (F5) |
| **Tax Rates Auth** | Modifying tax rates from within the POS |
| **Cash Count Auth** | Accessing the end-of-shift cash counting screen |

---

#### POS Terminals

Register multiple physical POS machines in the system. Each terminal maintains its own:

- **Terminal Name / ID**
- **Z-Counter** (separate running total per terminal)
- **Machine Identification Number (MIN)** — BIR-issued per machine
- **Serial Number**
- **OR Number Sequence** — Starting OR number and current sequence
- **Print Official Receipt** — Toggle: print an Official OR or a generic Invoice for this terminal
- **Official Receipt Settings** — OR number prefix, paper size

---

#### Sales Persons

Maintain the list of sales representatives available for assignment to customer accounts and Sales Orders. Supports add, edit, and deactivate.

---

#### Payment Terms

Define the list of payment terms available system-wide (used by both suppliers and customers):

- **Name** — Display label (e.g., "Net 30", "COD", "Net 15 days")
- **Days** — Number of days until payment is due (used for automatic due date calculation)

---

#### Transaction References

Configure the OR number / transaction reference sequences per terminal. Define:

- Starting number
- Number of digits (zero-padded)
- Optional prefix

---

### 12.2 Pricing (`/settings/pricing`)

**Price Levels** define the pricing tiers available across the system. Managed here:

| Setting | Description |
|---------|-------------|
| **Name** | Tier label (e.g., Wholesale, Dealer, Walk-in, VIP Member). |
| **Base** | Whether the adjustment applies to the `retail` price or the `cost`. |
| **Adjustment (%)** | Positive = markup above base; Negative = discount below base. |
| **Min Quantity** | Optional minimum quantity threshold to activate this level. |

Price Levels are assigned to customers in the Customer module and applied automatically at the POS.

---

### 12.3 Tax Rates (`/settings/tax-rates`)

Define the tax rates applicable to products. Alon POS currently distinguishes:

| VAT Type | Description |
|----------|-------------|
| **VAT** | 12% value-added tax (Philippine standard rate). |
| **Non-VAT** | Not subject to VAT (receipt shows "non-VATable" sales). |
| **Zero-Rated** | 0% VAT — applicable to export sales. Reported separately on Z-Reading. |
| **VAT-Exempt** | Exempt by law (e.g., basic necessities). Statutory exemption separate from zero-rating. |

Custom tax rates can be defined (name + percentage). A default tax rate is configured here and applied automatically when new products are created.

---

### 12.4 Appearance (`/settings/appearance`)

- **Theme Mode:** Light / Dark mode toggle (system-wide preference, stored per user session).
- **Primary Color:** Choose from a curated palette of accent colors applied throughout the backoffice UI.

---

### 12.5 Notifications (`/settings/notifications`)

Controls for the low-stock notification system:

| Setting | Description |
|---------|-------------|
| **Enable Push Notifications** | Turns on/off the low-stock notification badge on the Dashboard. |
| **Polling Interval** | How frequently (in seconds) the system checks for products below their reorder point. Lower intervals give more timely alerts at the cost of slightly higher database load. |

---

### 12.6 Data Management (`/settings/data-management`)

Tools for bulk data operations and database maintenance:

| Feature | Description |
|---------|-------------|
| **Export Products** | Download the full product catalog as a CSV file. All product attributes are included. |
| **Import Products** | Upload a CSV file (matching the export format) to bulk-create or bulk-update products. Column headers must match the expected schema. |
| **Export Customers** | Download the customer list as a CSV file. |
| **Import Customers** | Bulk-import customer records from a CSV file. |
| **Backup** | Trigger a manual database backup (snapshot of the entire MySQL database). Can also be configured for **scheduled automatic backups** at a defined interval. Backup files are stored locally. |
| **Restore** | Upload and restore the database from a previously generated backup file. Requires confirmation. |
| **Reset** | Perform a full data reset — clears all transactional data (sales, purchases, adjustments) while optionally retaining the product catalog and settings. Requires a typed confirmation phrase to prevent accidental execution. |

---

### 12.7 External API (`/settings/external-api`)

Alon POS can push data to an external system (e.g., an ERP, e-commerce platform, or analytics service) via outbound webhooks.

| Feature | Description |
|---------|-------------|
| **Endpoint URL** | The target URL where Alon POS will POST data events. |
| **Authentication** | Configure API key or Bearer token for securing the outbound request. |
| **Test Connection** | Sends a ping to the configured endpoint to verify connectivity and authentication before enabling live delivery. |
| **Webhook Delivery Log** | Shows a history of all outbound webhook calls: timestamp, event type, HTTP status code, and response body. |
| **Retry** | Failed webhook deliveries can be manually retried from the log. |

---

### 12.8 System (`/settings/system`)

Low-level system configuration intended for administrators and technical staff:

| Feature | Description |
|---------|-------------|
| **Database Connection** | Configure the MySQL host, port, database name, user, and password. Used to connect the Next.js backend to the database. |
| **Migration Runner** | Execute pending database schema migrations directly from the UI. Shows migration history and status. |
| **Developer Tools** | Advanced debugging utilities (query inspection, schema verification, cache purge). Restricted to Super Admin users. |
