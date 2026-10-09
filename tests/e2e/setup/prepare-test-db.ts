/**
 * Prepare-test-db — gi-tawag sa Playwright global setup (via tsx child process).
 *
 * Approach: i-clone ang SCHEMA gikan sa working dev `alon_pos` DB (structure ra,
 * walay data) ngadto sa pristine `alon_pos_test`, dayon i-seed ang deterministic
 * fixtures. Gigamit nato ang schema-clone imbes migration-replay tungod kay ang
 * migrations dili clean modagan gikan sa zero (out-of-band table deps + nagsumpaki
 * nga users-table definitions). Ang dev DB mao ang tinuod nga source of truth.
 *
 * IMPORTANTE: kini nga script kinahanglan modagan nga naka-set ang DB_NAME=alon_pos_test
 * sa environment aron ang fixtures mo-adto sa test DB, DILI sa dev `alon_pos`.
 */
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { execFileSync } from 'node:child_process';
import { hash } from 'bcryptjs';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import {
  TEST_USERS,
  TEST_PRODUCTS,
  BUSINESS_NAME,
  TEST_TERMINAL,
  TEST_PAYMENT_METHOD,
  TEST_BRAND,
  TEST_CATEGORY,
  TEST_UNIT,
  TEST_UNIT_BOX,
  TEST_UNIT_CASE,
  TEST_PRICE_LEVEL,
  TEST_PRICE_LEVEL_WHOLESALE,
  SELLING_UNITS_PRODUCT,
  EDITABLE_PRODUCT,
  DELETABLE_PRODUCT,
  INVENTORY_PRODUCT,
  PERISHABLE_PRODUCT,
  PERISHABLE_FAMILY_PARENT,
  PERISHABLE_FAMILY_CHILD,
  REASSIGN_PARENT_A,
  REASSIGN_PARENT_B,
  REASSIGN_CHILD,
  REASSIGN_TOP_MOVER,
  REASSIGN_TOP_TARGET,
  REASSIGN_TOP_MOVER_CHILD,
  REASSIGN_AUTO_MOVER,
  REASSIGN_AUTO_MATCH,
  REASSIGN_AUTO_NOMATCH,
  TEST_SUPPLIER,
  SHELF_A,
  SHELF_B,
  SHELF_XFER_PRODUCT,
  TEST_WAREHOUSE,
  BULK_PRICE_PRODUCT,
  PO_PRODUCT,
  SO_CUSTOMER,
  SO_PRODUCT,
  SO_SERVICE,
  TRANSFER_TARGET_WAREHOUSE,
  TRANSFER_NULL_SKU_SOURCE,
  TRANSFER_NULL_SKU_TARGET,
  TRANSFER_ORPHAN_PRODUCT,
} from '../fixtures/test-data';

dotenv.config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306');
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const SOURCE_DB = process.env.SOURCE_DB_NAME || 'alon_pos';
// Ang target kay TINUYO nga decoupled gikan sa DB_NAME (nga gi-set sa .env ngadto
// sa dev `alon_pos`). Gamiton ang TEST_DB_NAME aron luwas modagan bisan asa.
const TEST_DB_NAME = process.env.TEST_DB_NAME || 'alon_pos_test';

// Hard guard: ayaw gyud tugoti nga mo-drop/seed batok sa dev/prod DB.
if (TEST_DB_NAME === SOURCE_DB || TEST_DB_NAME === 'alon_pos') {
  throw new Error(`Refusing to run test-db setup against "${TEST_DB_NAME}". Set TEST_DB_NAME=alon_pos_test.`);
}

/** mysql/mysqldump CLI args nga walay password (gamiton ang MYSQL_PWD env). */
function cliArgs(db?: string): string[] {
  const args = ['-h', DB_HOST, '-P', String(DB_PORT), '-u', DB_USER];
  if (db) args.push(db);
  return args;
}

/** Drop ug re-create ang test DB para pristine kada run. */
async function recreateDatabase(): Promise<void> {
  const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD });
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
  await conn.query(`CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  console.log(`✅ Database "${TEST_DB_NAME}" recreated (pristine)`);
}

/** I-clone ang schema (walay data) gikan sa dev DB padulong sa test DB. */
function cloneSchema(): void {
  const env = { ...process.env, MYSQL_PWD: DB_PASSWORD };
  const dumpFile = path.join(os.tmpdir(), `alon_pos_test_schema_${Date.now()}.sql`);

  // Structure-only dump sa source DB.
  execFileSync(
    'mysqldump',
    [...cliArgs(), '--no-data', '--skip-triggers', '--no-tablespaces', `--result-file=${dumpFile}`, SOURCE_DB],
    { env, stdio: ['ignore', 'inherit', 'inherit'] },
  );

  // I-load ang schema ngadto sa test DB.
  const sql = fs.readFileSync(dumpFile, 'utf8');
  execFileSync('mysql', cliArgs(TEST_DB_NAME), { env, input: sql, stdio: ['pipe', 'inherit', 'inherit'] });

  fs.rmSync(dumpFile, { force: true });
  console.log(`✅ Schema cloned: ${SOURCE_DB} → ${TEST_DB_NAME}`);
}

/** I-seed ang deterministic fixtures (users, products, pos settings). */
async function seedFixtures(): Promise<void> {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: TEST_DB_NAME,
  });

  // --- user_types (login mo-LEFT JOIN niini para sa roleId) ---
  for (const name of ['Admin', 'Cashier']) {
    await conn.query('INSERT INTO user_types (id, name, description) VALUES (?, ?, ?)', [
      `ut-${name.toLowerCase()}`,
      name,
      `Test ${name} role`,
    ]);
  }

  // --- users (real bcrypt hash aron molampos ang tinuod nga login flow) ---
  for (const u of Object.values(TEST_USERS)) {
    const passwordHash = await hash(u.password, 10);
    await conn.query(
      'INSERT INTO users (uid, username, password, display_name, user_type, disabled) VALUES (?, ?, ?, ?, ?, 0)',
      [u.uid, u.username, passwordHash, u.displayName, u.userType],
    );
    // Admin → tagai ug access_pos + view_dashboard permissions.
    const perms = u.userType === 'Admin'
      ? ['access_pos', 'view_dashboard', 'view_sales', 'view_reports', 'manage_products']
      : ['access_pos'];
    for (const p of perms) {
      await conn.query('INSERT INTO user_permissions (id, user_uid, permission) VALUES (?, ?, ?)', [
        `${u.uid}-${p}`,
        u.uid,
        p,
      ]);
    }
  }

  // --- pos_settings (single row; app layout mo-fetch sa businessName) ---
  await conn.query(
    'INSERT INTO pos_settings (id, business_name, currency_symbol, currency_code) VALUES (?, ?, ?, ?)',
    ['pos_settings_1', BUSINESS_NAME, '₱', 'PHP'],
  );

  // --- price levels (kinahanglan una sa products: ang
  // product_selling_unit_prices naay FK padulong sa price_levels) ---
  await conn.query(
    `INSERT INTO price_levels (id, name, calculation_base, is_default, percentage_adjustment)
     VALUES (?, ?, 'retail', 1, 100.00)`,
    [TEST_PRICE_LEVEL.id, TEST_PRICE_LEVEL.name],
  );
  await conn.query(
    `INSERT INTO price_levels (id, name, calculation_base, is_default, percentage_adjustment)
     VALUES (?, ?, 'retail', 0, 90.00)`,
    [TEST_PRICE_LEVEL_WHOLESALE.id, TEST_PRICE_LEVEL_WHOLESALE.name],
  );

  // --- products ---
  for (const p of TEST_PRODUCTS) {
    await conn.query(
      'INSERT INTO products (id, name, price, stock, sku, barcode, availability) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.price, p.stock, p.sku, p.barcode, 'Available'],
    );
  }

  // --- dedicated products para sa edit/delete/inventory tests (kompleto ang fields) ---
  for (const p of [EDITABLE_PRODUCT, DELETABLE_PRODUCT, INVENTORY_PRODUCT]) {
    await conn.query(
      `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
      [p.id, p.name, p.price, p.stock, p.sku, p.description, p.brand, p.category, p.unitOfMeasure],
    );
  }

  // --- product nga naa nay selling units (stand-in para sa Plan 1 migrated data) ---
  await conn.query(
    `INSERT INTO products (id, name, price, cost, stock, sku, barcode, description, brand, category, unit_of_measure, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
    [
      SELLING_UNITS_PRODUCT.id, SELLING_UNITS_PRODUCT.name, SELLING_UNITS_PRODUCT.price,
      SELLING_UNITS_PRODUCT.cost, SELLING_UNITS_PRODUCT.stock, SELLING_UNITS_PRODUCT.sku,
      SELLING_UNITS_PRODUCT.barcode, SELLING_UNITS_PRODUCT.description,
      SELLING_UNITS_PRODUCT.brand, SELLING_UNITS_PRODUCT.category, SELLING_UNITS_PRODUCT.unitOfMeasure,
    ],
  );
  for (const u of SELLING_UNITS_PRODUCT.units) {
    await conn.query(
      `INSERT INTO product_selling_units
         (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.id, SELLING_UNITS_PRODUCT.id, u.unitName, u.qtyBase, u.barcode, u.cost, u.price, u.isBase ? 1 : 0, u.sortOrder],
    );
    await conn.query(
      `INSERT INTO product_selling_unit_prices (selling_unit_id, price_level_id, price, min_quantity)
       VALUES (?, ?, ?, 0), (?, ?, ?, 0)`,
      [u.id, TEST_PRICE_LEVEL.id, u.retail, u.id, TEST_PRICE_LEVEL_WHOLESALE.id, u.wholesale],
    );
  }

  // Two batches at different costs so a FIFO deduction is observable: a Case of
  // 24 must consume the OLDER batch first. Totals 60, matching the product's
  // seeded stock. `selling_price` is NOT NULL with no default, so it must be
  // supplied.
  await conn.query(
    `INSERT INTO inventory_batches
       (id, product_id, received_date, quantity_in, quantity_remaining,
        unit_cost, selling_price, source_type, created_at)
     VALUES
       (?, ?, '2026-01-01', 40, 40, 18.0000, 25.00, 'seed', NOW()),
       (?, ?, '2026-02-01', 20, 20, 20.0000, 25.00, 'seed', NOW())`,
    [
      'batch-su-old', SELLING_UNITS_PRODUCT.id,
      'batch-su-new', SELLING_UNITS_PRODUCT.id,
    ],
  );

  // Perishable product — managlahi ang insert kay kinahanglan niya ang is_perishable flag.
  await conn.query(
    `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability, is_perishable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', 1)`,
    [
      PERISHABLE_PRODUCT.id, PERISHABLE_PRODUCT.name, PERISHABLE_PRODUCT.price,
      PERISHABLE_PRODUCT.stock, PERISHABLE_PRODUCT.sku, PERISHABLE_PRODUCT.description,
      PERISHABLE_PRODUCT.brand, PERISHABLE_PRODUCT.category, PERISHABLE_PRODUCT.unitOfMeasure,
    ],
  );

  // --- dedicated parent/child family para sa "expiry lands on wrong product" regression ---
  await conn.query(
    `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
    [
      PERISHABLE_FAMILY_PARENT.id, PERISHABLE_FAMILY_PARENT.name, PERISHABLE_FAMILY_PARENT.price,
      PERISHABLE_FAMILY_PARENT.stock, PERISHABLE_FAMILY_PARENT.sku, PERISHABLE_FAMILY_PARENT.description,
      PERISHABLE_FAMILY_PARENT.brand, PERISHABLE_FAMILY_PARENT.category, PERISHABLE_FAMILY_PARENT.unitOfMeasure,
    ],
  );
  await conn.query(
    `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, parent_id, availability, is_perishable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', 1)`,
    [
      PERISHABLE_FAMILY_CHILD.id,
      PERISHABLE_FAMILY_CHILD.name,
      PERISHABLE_FAMILY_CHILD.price,
      PERISHABLE_FAMILY_CHILD.stock,
      PERISHABLE_FAMILY_CHILD.sku,
      PERISHABLE_FAMILY_CHILD.description,
      PERISHABLE_FAMILY_CHILD.brand,
      PERISHABLE_FAMILY_CHILD.category,
      PERISHABLE_FAMILY_CHILD.unitOfMeasure,
      PERISHABLE_FAMILY_PARENT.id,
    ],
  );
  await conn.query(
    `INSERT INTO conversion_factors (id, product_id, unit, factor)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE factor = VALUES(factor)`,
    ['perish-fam-par-cf-piece', PERISHABLE_FAMILY_PARENT.id, PERISHABLE_FAMILY_CHILD.unitOfMeasure, 12],
  );

  // --- dedicated parent/child family para sa child-reassignment test ---
  for (const p of [REASSIGN_PARENT_A, REASSIGN_PARENT_B]) {
    await conn.query(
      `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
      [p.id, p.name, p.price, p.stock, p.sku, p.description, p.brand, p.category, p.unitOfMeasure],
    );
  }
  await conn.query(
    `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, parent_id, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
    [
      REASSIGN_CHILD.id,
      REASSIGN_CHILD.name,
      REASSIGN_CHILD.price,
      REASSIGN_CHILD.stock,
      REASSIGN_CHILD.sku,
      REASSIGN_CHILD.description,
      REASSIGN_CHILD.brand,
      REASSIGN_CHILD.category,
      REASSIGN_CHILD.unitOfMeasure,
      REASSIGN_PARENT_A.id,
    ],
  );
  await conn.query(
    `INSERT INTO conversion_factors (id, product_id, unit, factor)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE factor = VALUES(factor)`,
    ['rsn-parA-cf-piece', REASSIGN_PARENT_A.id, REASSIGN_CHILD.unitOfMeasure, 12],
  );

  // --- dedicated top-level mover family para sa top-level-reassignment test ---
  for (const p of [REASSIGN_TOP_MOVER, REASSIGN_TOP_TARGET]) {
    await conn.query(
      `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
      [p.id, p.name, p.price, p.stock, p.sku, p.description, p.brand, p.category, p.unitOfMeasure],
    );
  }
  await conn.query(
    `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, parent_id, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
    [
      REASSIGN_TOP_MOVER_CHILD.id,
      REASSIGN_TOP_MOVER_CHILD.name,
      REASSIGN_TOP_MOVER_CHILD.price,
      REASSIGN_TOP_MOVER_CHILD.stock,
      REASSIGN_TOP_MOVER_CHILD.sku,
      REASSIGN_TOP_MOVER_CHILD.description,
      REASSIGN_TOP_MOVER_CHILD.brand,
      REASSIGN_TOP_MOVER_CHILD.category,
      REASSIGN_TOP_MOVER_CHILD.unitOfMeasure,
      REASSIGN_TOP_MOVER.id,
    ],
  );
  await conn.query(
    `INSERT INTO conversion_factors (id, product_id, unit, factor)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE factor = VALUES(factor)`,
    ['rsn-topmover-cf-piece', REASSIGN_TOP_MOVER.id, REASSIGN_TOP_MOVER_CHILD.unitOfMeasure, 6],
  );

  // --- dedicated, fully independent family para sa "Reassign factor auto-detect" test.
  // Wala ni gigamit sa laing test, mao nga REASSIGN_AUTO_NOMATCH magpabilin gyud nga
  // walay factor bisan unsa pa ang order sa pag-execute sa spec file. ---
  for (const p of [REASSIGN_AUTO_MOVER, REASSIGN_AUTO_MATCH, REASSIGN_AUTO_NOMATCH]) {
    await conn.query(
      `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
      [p.id, p.name, p.price, p.stock, p.sku, p.description, p.brand, p.category, p.unitOfMeasure],
    );
  }
  await conn.query(
    `INSERT INTO conversion_factors (id, product_id, unit, factor)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE factor = VALUES(factor)`,
    ['rsn-auto-cf-box', REASSIGN_AUTO_MATCH.id, REASSIGN_AUTO_MOVER.unitOfMeasure, 4],
  );
  // REASSIGN_AUTO_NOMATCH intentionally gets NO conversion_factors row.

  // --- supplier + warehouse (para sa purchase-order test) ---
  await conn.query('INSERT INTO suppliers (id, name) VALUES (?, ?)', [TEST_SUPPLIER.id, TEST_SUPPLIER.name]);
  await conn.query('INSERT INTO warehouses (id, name) VALUES (?, ?)', [TEST_WAREHOUSE.id, TEST_WAREHOUSE.name]);

  // Product assigned to TEST_WAREHOUSE — the Pricing page's product
  // picker filters by warehouse_id, and TEST_PRODUCTS all have NULL warehouse_id.
  await conn.query(
    `INSERT INTO products (id, name, price, cost, stock, sku, barcode, warehouse_id, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
    [
      BULK_PRICE_PRODUCT.id, BULK_PRICE_PRODUCT.name, BULK_PRICE_PRODUCT.price, BULK_PRICE_PRODUCT.cost,
      BULK_PRICE_PRODUCT.stock, BULK_PRICE_PRODUCT.sku, BULK_PRICE_PRODUCT.barcode, BULK_PRICE_PRODUCT.warehouseId,
    ],
  );

  // --- bulk-transfer fixtures: ikaduhang warehouse + NULL-SKU nga pares + orphan ---
  await conn.query('INSERT INTO warehouses (id, name) VALUES (?, ?)', [
    TRANSFER_TARGET_WAREHOUSE.id, TRANSFER_TARGET_WAREHOUSE.name,
  ]);

  // Ang sku gituyo nga WALA sa column list — NULL gyud siya, dili '' (ang
  // (sku, warehouse_id) unique index mo-treat sa '' nga usa ka tinuod nga value).
  for (const p of [TRANSFER_NULL_SKU_SOURCE, TRANSFER_NULL_SKU_TARGET, TRANSFER_ORPHAN_PRODUCT]) {
    await conn.query(
      `INSERT INTO products (id, name, price, cost, stock, barcode, warehouse_id, availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Available')`,
      [p.id, p.name, p.price, p.cost, p.stock, p.barcode, p.warehouseId],
    );
  }
  // Ang orphan ra ang naay SKU — aron ma-exercise ang SKU-miss → auto-create nga path.
  await conn.query('UPDATE products SET sku = ? WHERE id = ?', [
    TRANSFER_ORPHAN_PRODUCT.sku, TRANSFER_ORPHAN_PRODUCT.id,
  ]);

  // Product nga naka-link sa supplier (ang PO product selector mo-filter by supplier).
  await conn.query(
    `INSERT INTO products (id, name, price, cost, stock, sku, supplier_id, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Available')`,
    [PO_PRODUCT.id, PO_PRODUCT.name, PO_PRODUCT.price, PO_PRODUCT.cost, PO_PRODUCT.stock, PO_PRODUCT.sku, PO_PRODUCT.supplierId],
  );

  // --- shelf-transfer fixtures: duha ka shelf + produkto nga partial ang assignment ---
  for (const s of [SHELF_A, SHELF_B]) {
    await conn.query('INSERT INTO shelf_locations (id, name, is_active) VALUES (?, ?, 1)', [s.id, s.name]);
  }
  await conn.query(
    `INSERT INTO products (id, name, price, cost, stock, sku, availability)
     VALUES (?, ?, ?, ?, ?, ?, 'Available')`,
    [SHELF_XFER_PRODUCT.id, SHELF_XFER_PRODUCT.name, SHELF_XFER_PRODUCT.price,
     SHELF_XFER_PRODUCT.cost, SHELF_XFER_PRODUCT.stock, SHELF_XFER_PRODUCT.sku],
  );
  // Partial ra ang assignment: 4 sa A, 6 sa B, 20 ang nahabilin nga unassigned.
  await conn.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)',
    [SHELF_XFER_PRODUCT.id, SHELF_A.id, SHELF_XFER_PRODUCT.onShelfA]);
  await conn.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)',
    [SHELF_XFER_PRODUCT.id, SHELF_B.id, SHELF_XFER_PRODUCT.onShelfB]);

  // --- sales-order fixtures: customer + usa ka stocked nga produkto + usa ka serbisyo ---
  await conn.query('INSERT INTO customers (id, name) VALUES (?, ?)', [SO_CUSTOMER.id, SO_CUSTOMER.name]);

  for (const p of [SO_PRODUCT, SO_SERVICE]) {
    await conn.query(
      `INSERT INTO products (id, name, price, cost, stock, sku, availability, type)
       VALUES (?, ?, ?, ?, ?, ?, 'Available', ?)`,
      [p.id, p.name, p.price, p.cost, p.stock, p.sku, p === SO_SERVICE ? 'service' : 'standard'],
    );
  }

  // --- pos_terminals (gikinahanglan sa POS shift + sale flow) ---
  await conn.query(
    `INSERT INTO pos_terminals (id, name, location, ip_address, is_active, x_counter, z_counter, or_next_reference)
     VALUES (?, ?, ?, ?, 1, 0, 0, '000000')`,
    [TEST_TERMINAL.id, TEST_TERMINAL.name, TEST_TERMINAL.location, TEST_TERMINAL.ipAddress],
  );

  // --- payment_methods (Cash para sa tender) ---
  await conn.query(
    'INSERT INTO payment_methods (id, name, is_active, require_reference) VALUES (?, ?, 1, 0)',
    [TEST_PAYMENT_METHOD.id, TEST_PAYMENT_METHOD.name],
  );

  // --- transaction_references (id=1) — gikinahanglan sa checkout para sa OR/
  // reference numbering (getNextReference/getNextReceiptNumber mo-UPDATE id=1). ---
  await conn.query(
    `INSERT INTO transaction_references
       (id, sales_order, purchase_order, sales_delivery, payment_to_supplier,
        sales_invoice, customer_payment, delivery_receipt, stock_adjustment,
        sales_hold, receipt_number)
     VALUES (1, '1000','1000','1000','1000','1000','1000','1000','1000','1000','000000')`,
  );

  // --- product-option master data (para sa Add Product form dropdowns) ---
  await conn.query('INSERT INTO brands (id, name) VALUES (?, ?)', [TEST_BRAND.id, TEST_BRAND.name]);
  // markup_percentage 25 → ang Add Product form mo-auto-calculate ug price gikan sa
  // cost (walay standalone price input; price gikan sa markup o price levels).
  await conn.query('INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, 25.00)', [
    TEST_CATEGORY.id,
    TEST_CATEGORY.name,
  ]);
  await conn.query('INSERT INTO units_of_measure (id, name, abbreviation) VALUES (?, ?, ?)', [
    TEST_UNIT.id,
    TEST_UNIT.name,
    TEST_UNIT.abbreviation,
  ]);
  // Box/Case — extra units the Selling Units tab's non-base rows need selectable
  // in its Unit Name picker (see the fixture's comment for why).
  for (const u of [TEST_UNIT_BOX, TEST_UNIT_CASE]) {
    await conn.query('INSERT INTO units_of_measure (id, name, abbreviation) VALUES (?, ?, ?)', [
      u.id,
      u.name,
      u.abbreviation,
    ]);
  }
  await conn.end();
  console.log(
    `✅ Seeded: ${Object.keys(TEST_USERS).length} users, ${TEST_PRODUCTS.length + 4} products, ` +
      `1 terminal, 1 payment method, 1 supplier, 1 warehouse, ` +
      `1 brand/category/unit, 2 price levels, pos_settings, transaction_references`,
  );
}

async function main() {
  console.log(`--- Preparing test DB: ${TEST_DB_NAME} (clone of ${SOURCE_DB}) @ ${DB_HOST}:${DB_PORT} ---`);
  await recreateDatabase();
  cloneSchema();
  await seedFixtures();
  console.log('✅ Test DB prepared');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test DB prep failed:', err);
  process.exit(1);
});
