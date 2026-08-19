# E2E Tests (Playwright)

Browser-based end-to-end tests para sa Alon POS Next.js web app.

## Pagdagan

```bash
npm run test:e2e          # tanan tests (headless)
npm run test:e2e:ui       # interactive UI mode (debugging)
npm run test:e2e:report   # tan-awon ang HTML report
npm run test:e2e:db       # i-recreate + i-seed ra ang test DB (manwal)
```

## Giunsa molihok

- **Isolated test server:** ang tests modagan batok sa usa ka dedicated `next dev`
  sa **port 3100** nga naka-point sa **`alon_pos_test`** database — DILI sa imong dev
  `alon_pos` (port 3000). Luwas modagan bisan naa'y dev server nga gigamit.
- **Coexistence sa dev server:** ang Next.js dev naa'y singleton lock per `.next`.
  Ang test server mogamit ug `NEXT_DIST_DIR=.next-test` (set sa webServer env) aron
  makasabay sa usa ka running nga dev server sa 3000. Tan-awa ang `distDir` sa
  [next.config.ts](../../next.config.ts).
- **Test database:** ang [global-setup](setup/global-setup.ts) mo-recreate sa
  `alon_pos_test` kada run pinaagi sa pag-**clone sa schema** gikan sa dev `alon_pos`
  (structure ra, walay data) dayon mo-seed ug deterministic fixtures.
  - Schema-clone ang gigamit (dili migration-replay) kay ang migrations dili clean
    modagan gikan sa zero. Ang dev DB mao ang source of truth sa schema.
  - Kinahanglan ang `mysqldump`/`mysql` CLI sa PATH (MySQL Server bin).
- **Fixtures:** tan-awon ang [fixtures/test-data.ts](fixtures/test-data.ts) — usa ra
  ka source of truth sa known test users, products, ug business name.

## Test users (seeded)

| Username | Password | Type |
|----------|----------|------|
| `test.admin` | `Test@1234` | Admin |
| `test.cashier` | `Test@1234` | Cashier |

## Mga spec

- [`login.spec.ts`](login.spec.ts) — login page UI + validation (walay DB)
- [`auth.spec.ts`](auth.spec.ts) — auth flow nga gi-**mock** ang `/api/auth/login` (walay DB)
- [`db-backed.spec.ts`](db-backed.spec.ts) — tinuod nga login + seeded data batok sa `alon_pos_test`
- [`pos-sale.spec.ts`](pos-sale.spec.ts) — kompleto nga POS flow: cashier login → start shift →
  add product → tender → cash sale (na-save sa DB) → cart clear
- [`add-product.spec.ts`](add-product.spec.ts) — admin mag-create ug bag-ong product pinaagi sa
  Add Product dialog → na-persist sa DB
- [`product-edit-delete.spec.ts`](product-edit-delete.spec.ts) — admin mag-edit (ngalan) ug mag-delete
  ug product pinaagi sa row action menu → na-verify sa DB
- [`inventory-adjust.spec.ts`](inventory-adjust.spec.ts) — admin mag-adjust (add) ug stock pinaagi sa
  Adjust Stock dialog → na-verify ang bag-ong stock sa DB
- [`purchase-order.spec.ts`](purchase-order.spec.ts) — PO creation via API (na-persist + makita sa list)
  ug UI smoke sa Add Purchase Order dialog (header selects)

## POS test gotchas (importante kung magdugang)

- **Warehouse filter:** ang POS mo-filter sa products pinaagi sa terminal `location` →
  `products.warehouse_id`. Ang test terminal `location` MUST be `''` kay ang test products
  naa'y `NULL` warehouse_id (kung dili, mawala tanan products sa POS).
- **transaction_references:** ang checkout nagkinahanglan ug row nga `id=1` para sa OR/
  receipt numbering — gi-seed na sa `prepare-test-db.ts`.
- **Shift isolation:** ang POS mo-resume ug active shift, mao nga ang [`helpers/db.ts`](helpers/db.ts)
  `resetPosState()` gi-tawag sa `beforeEach` aron limpyo ang shift/sale state.
- **Add Product price:** ang Add Product form WALAY standalone price input — ang price mo-auto-
  calculate gikan sa cost × category markup. Mao nga ang test category gi-seed nga may
  `markup_percentage = 25`, ug ang test mag-fill ug cost (dili price).
- **Edit validation:** ang Edit form nag-require ug brand/category/description/unit (non-empty).
  Ang seeded `EDIT-ME` / `DELETE-ME` products kompleto ang fields aron mo-pasar ang validation —
  hilit gikan sa POS test products aron walay cross-spec coupling.
- **PO line items via API:** ang in-dialog ProductSelector (custom scan-input, naka-filter by
  supplier) dili lig-on i-drive sa e2e, mao nga ang PO line-item creation gi-test sa API level.
  Ang UI test mag-cover ra sa dialog open + header selects.

## Bug nga nakit-an sa e2e testing

Ang `useProducts` hook nag-return ug `data || []` — usa ka bag-ong `[]` matag render.
Kini nga unstable array, gigamit isip effect dependency sa Add Purchase Order dialog
(uban sa `form.setValue('reference', generateReference())`), naghimo ug **infinite render
loop** ("Maximum update depth exceeded") nga nag-crash sa /purchases page. Na-fix pinaagi
sa pag-return ug stable nga empty-array constant ([hooks/use-api.ts](../../hooks/use-api.ts)).

## Pag-add ug bag-ong test

1. Para sa pure UI/logic → i-mock ang network (tan-awon `helpers/auth.ts`).
2. Para sa tinuod nga business logic → gamita ang seeded fixtures ug `realLogin()`.
3. Kung magdugang ug bag-ong fixture data, i-add sa `fixtures/test-data.ts` UG
   i-seed sa `setup/prepare-test-db.ts`.

> ⚠️ Ang test DB drop/seed naa'y hard guard batok sa `alon_pos` — dili gyud ni
> makahilabot sa imong dev/prod data.
