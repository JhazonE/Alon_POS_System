# Consolidate warehouse and shelf transfers into Bulk Adjustment

**Date:** 2026-10-09
**Status:** Awaiting review

## Problem

Moving stock today means choosing between three screens that each do part of the
job:

| Screen | Moves | Endpoint |
|---|---|---|
| [Transfer Board](../../../app/(app)/inventory/transfer-board/) | stock between **warehouses** | `POST /api/inventory/transfer/bulk` |
| [Shelf Board](../../../app/(app)/inventory/shelf-board/) | a product's **shelf location** | `updateProductShelfLocations()` |
| [Bulk Adjustment](../../../app/(app)/inventory/bulk-adjustment/) | add / remove / warehouse transfer | `POST /api/inventory/adjust/bulk` |

The warehouse transfer capability is duplicated outright: the Transfer Board and
Bulk Adjustment both do it, through different endpoints, with different UI
idioms (kanban staging vs. search-and-list).

The product owner wants one place for every transfer: **Bulk Adjustment**. Both
boards go away.

## Decisions

Confirmed with the product owner (2026-10-09):

- **D1 — Shelf transfers live inside the existing `transfer` mode**, not as a
  fourth mode. The mode tabs stay three: Add / Remove / Transfer.
- **D2 — A destination-type toggle** inside transfer mode picks *To Warehouse* or
  *To Shelf*, and swaps the target picker. One destination per batch.
- **D3 — One source warehouse per batch.** The Transfer Board's multi-source
  capability (per-item `sourceWarehouseId`) is dropped. Mixing sources in one
  batch is no longer possible; it needs one batch per source.
- **D4 — The two approval types stay separate.** `STOCK_TRANSFER` for warehouse,
  `SHELF_TRANSFER` for shelf. They have different finalization paths and are not
  merged.

## Why the backend is not unified

The two transfers look alike in the UI and are nothing alike underneath:

| | Writes | Total stock | Approval type |
|---|---|---|---|
| Warehouse | `products.stock` on two rows, one per warehouse | moves between rows | `STOCK_TRANSFER` |
| Shelf | `product_shelves.quantity` | **unchanged** | `SHELF_TRANSFER` |

A shelf transfer is a *location* change: the product has one row, one stock
value, and the move only reassigns which shelf holds how much. A warehouse
transfer is a *stock* change across two product rows.

Collapsing these into one endpoint would mean one code path deciding, per item,
whether to touch `products.stock` or `product_shelves` — the kind of branch that
eventually gets the decision wrong and corrupts inventory. So:

**The UI is what gets unified. The two write paths stay as they are.**

```
Bulk Adjustment page (one screen)
  |
  +- Add / Remove ------------> POST /api/inventory/adjust/bulk
  +- Transfer -> Warehouse ---> POST /api/inventory/adjust/bulk  (adjustmentType: 'transfer')
  +- Transfer -> Shelf -------> updateProductShelfLocations()
```

`updateProductShelfLocations()`
([actions.ts:1177](../../../app/(app)/products/actions.ts#L1177)) is reused
unchanged. It already carries the approval enrichment, the `product_shelves`
arithmetic, and the legacy `products.shelf_location_id` sync. The new UI calls
it; nothing inside it moves.

This keeps the risk in presentation code rather than in stock arithmetic.

## Shelves are global, not per-warehouse

`shelf_locations` has no `warehouse_id` column:

| Column | Type |
|---|---|
| `id` | varchar(50) |
| `name` | varchar(255) |
| `description` | text |
| `is_active` | tinyint(1) |

Shelves are system-wide. A shelf transfer therefore answers "which shelf holds
this stock", independent of warehouse. **This spec preserves that model and does
not scope shelves to warehouses** — that is a separate change with its own
migration.

Consequence: in shelf mode the source warehouse picker is irrelevant to the
write. It still filters which products appear (consistent with the rest of the
page), but the shelf move itself is warehouse-agnostic.

## UI

```
Adjustment Mode:  [ Add ]  [ Remove ]  [ Transfer ]
                                        '- active

+- Transfer To -------------------------------+
|   (o) Warehouse        ( ) Shelf            |   <- new toggle
+---------------------------------------------+

  When Warehouse:               When Shelf:
  Source Warehouse  [STORE  v]  Source Shelf   [Aisle A1 v]
  Destination       [BODEGA v]  Destination    [Aisle B2 v]
```

New state in `useBulkAdjustment`: `transferTarget: 'warehouse' | 'shelf'`, plus
`sourceShelfId` and `targetShelfId`. The existing `warehouseId` /
`targetWarehouseId` state is untouched.

Both shelf pickers include an **Unassigned** option, matching the Shelf Board's
treatment of stock not yet on any shelf.

## Quantity limits differ by destination

This is the subtle part, and the most likely source of a bug.

| Mode | Max transferable |
|---|---|
| Warehouse | `product.stock` |
| Shelf | `product.shelfQuantities[sourceShelfId]` |
| Shelf, source = Unassigned | `product.stock - sum(shelfQuantities)` |

In shelf mode the ceiling is **what sits on the source shelf**, not the product's
total stock. A product with 100 total but 3 on Aisle A1 can only move 3 off A1.
The Unassigned computation mirrors
[ShelfBoard.tsx:89-92](../../../app/(app)/inventory/shelf-board/ShelfBoard.tsx#L89-L92).

For the same reason, in shelf mode the product search lists only products with
stock **on the selected source shelf**. Otherwise a user can stage an item that
cannot move.

`shelfQuantities` already arrives with the product list — `getProducts()`
aggregates it
([actions.ts:89](../../../app/(app)/products/actions.ts#L89)) and
`useBulkAdjustment` already calls `getProducts()`. No new data fetching.

## Removals

| Path | Lines | Note |
|---|---|---|
| `app/(app)/inventory/transfer-board/` | 604 | 6 files |
| `app/(app)/inventory/shelf-board/` | ~266 | 2 files |
| `app/api/inventory/transfer/bulk/` | — | zero callers once the board is gone (verified) |
| 2 nav links in `app/(app)/inventory/page.tsx:87-101` | — | |

**Deliberately kept:**

- `updateProductShelfLocations()` — reused by the new UI, and by
  `SHELF_TRANSFER` approval finalization
  ([process/route.ts:152](../../../app/api/approvals/process/route.ts#L152))
- `ManageShelfLocationsDialog`, `/api/shelf-locations` — shelf CRUD, unrelated
- `/api/inventory/transfer` (single-item) — separate consumer
- `TransferStockService`, `MySqlInventoryTransferRepository` — used by the
  single-item transfer route and by `STOCK_TRANSFER` finalization

## Testing

Neither board has any e2e coverage today, so nothing breaks on removal — and
nothing protects the behaviour being moved. Tests come first:

| Test | Asserts |
|---|---|
| Warehouse transfer via Bulk Adjustment | source `products.stock` down, target row up |
| Shelf transfer via Bulk Adjustment | `product_shelves` rows move, **`products.stock` unchanged** |
| Shelf max-quantity clamp | ceiling is the source shelf's quantity, not total stock |
| Shelf source = Unassigned | draws from `stock - sum(shelfQuantities)` |
| Routes removed | `/inventory/transfer-board` and `/inventory/shelf-board` 404 |

The `products.stock`-unchanged assertion on the shelf path is the one that
matters most: if a shelf move ever alters total stock, inventory is corrupt.

Assertions read the **database**, not the UI, following the convention in
`tests/e2e/adjustment-expiration.spec.ts` — a success toast does not prove a
write landed.

## Out of scope (YAGNI)

- **Multi-source batches** — dropped per D3
- **Mixed warehouse + shelf in one batch** — one destination per batch (D2)
- **Scoping shelves to warehouses** — needs a migration; separate change
- **Kanban drag-and-drop in Bulk Adjustment** — the page's idiom is search-and-stage

## Accepted trade-off

The boards' side-by-side kanban (source | staging | target) is lost. For a few
items the Bulk Adjustment flow is faster. For re-shelving dozens of items at
once, the kanban was better suited. The product owner accepted this, having been
shown the trade-off before approval.

Should bulk re-shelving later prove painful, the fix is a multi-select staging
affordance *inside* Bulk Adjustment — not bringing a second screen back.
