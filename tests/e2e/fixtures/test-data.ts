/**
 * Centralized test fixtures — gigamit sa prepare-test-db.ts (pag-seed) ug sa mga
 * spec (pag-assert). Usa ra ka source of truth para sa known test data.
 */

export const BUSINESS_NAME = 'Alon Test Store';

export const TEST_PASSWORD = 'Test@1234';

export type TestUser = {
  uid: string;
  username: string;
  password: string;
  displayName: string;
  userType: 'Admin' | 'Cashier';
};

export const TEST_USERS: Record<'admin' | 'cashier', TestUser> = {
  admin: {
    uid: 'test-admin-uid',
    username: 'test.admin',
    password: TEST_PASSWORD,
    displayName: 'Test Admin',
    userType: 'Admin',
  },
  cashier: {
    uid: 'test-cashier-uid',
    username: 'test.cashier',
    password: TEST_PASSWORD,
    displayName: 'Test Cashier',
    userType: 'Cashier',
  },
};

export type TestProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  sku: string;
  barcode: string;
};

export const TEST_PRODUCTS: TestProduct[] = [
  { id: 'test-prod-1', name: 'Test Coffee 3-in-1', price: 12.5, stock: 100, sku: 'TST-COF-001', barcode: '4800000000017' },
  { id: 'test-prod-2', name: 'Test Bottled Water 500ml', price: 20, stock: 250, sku: 'TST-WTR-002', barcode: '4800000000024' },
  { id: 'test-prod-3', name: 'Test Instant Noodles', price: 15.75, stock: 80, sku: 'TST-NDL-003', barcode: '4800000000031' },
];

/** POS terminal — ip 127.0.0.1 aron auto-match sa local test client; fallback usab
 * isip terminalsData[0] kay kini ra ang terminal.
 *
 * location MUST be '' (walay inventory location). Ang POS mo-filter sa products
 * pinaagi sa terminal.location → products.warehouse_id; ang atong test products
 * naa'y NULL warehouse_id, mao nga ang bisan unsang location mo-exclude nila. */
export const TEST_TERMINAL = {
  id: 'test-terminal-1',
  name: 'Test Counter 1',
  location: '',
  ipAddress: '127.0.0.1',
};

/** Cash payment method para sa tender flow. */
export const TEST_PAYMENT_METHOD = {
  id: 'pm-cash',
  name: 'Cash',
};

/** Product-option master data — gikinahanglan sa Add Product form (mga dropdown). */
export const TEST_BRAND = { id: 'brand-test', name: 'Test Brand' };
export const TEST_CATEGORY = { id: 'cat-test', name: 'Test Category' };
export const TEST_UNIT = { id: 'uom-piece', name: 'Piece', abbreviation: 'pcs' };
/**
 * Extra units of measure for the Selling Units tab's non-base rows. The Unit
 * Name field there is a Select (InlineEditableSelect over units_of_measure),
 * not free text, and it renders with no `orphanLabel` fallback — so any unit
 * name a selling-unit row uses (typed via the UI, or pre-seeded straight into
 * product_selling_units for the edit-test fixture) must exist here first, or
 * it simply won't be selectable/won't render in the trigger.
 */
export const TEST_UNIT_BOX = { id: 'uom-box', name: 'Box', abbreviation: 'bx' };
export const TEST_UNIT_CASE = { id: 'uom-case', name: 'Case', abbreviation: 'cs' };
/** Default retail price level — ang form mo-sync sa main price gikan sa default level. */
export const TEST_PRICE_LEVEL = { id: 'retail-level', name: 'Retail', isDefault: true };

/**
 * Second (non-default) price level. The Selling Units tab renders ONE COLUMN
 * PER ACTIVE PRICE LEVEL, so a second level is what makes the multi-column
 * behaviour testable at all. percentage_adjustment 90 = a 10% discount off
 * retail's 100 — a value distinguishable from retail's in an assertion.
 */
export const TEST_PRICE_LEVEL_WHOLESALE = {
  id: 'wholesale-level',
  name: 'Wholesale',
  isDefault: false,
};

/** Bag-ong product nga himuon sa Add Product UI test. */
export const NEW_PRODUCT = {
  name: 'QA Test Widget',
  description: 'A widget created by the e2e Add Product test.',
  price: 99.5,
  stock: 42,
  unitName: 'Piece',
  barcode: '5000000000014',
  cost: 80,
  retail: 100,
};

/**
 * Dedicated nga products para sa edit/delete tests — kompleto ang required fields
 * (brand/category/description/unit) aron mo-pasar ang edit form validation, ug
 * hilit gikan sa TEST_PRODUCTS aron walay cross-spec coupling.
 */
export type FullProduct = {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  stock: number;
  brand: string;
  category: string;
  unitOfMeasure: string;
};

export const EDITABLE_PRODUCT: FullProduct = {
  id: 'test-editable-1',
  name: 'Editable Widget',
  sku: 'EDIT-ME-001',
  description: 'Product para edit-on sa e2e test.',
  price: 50,
  stock: 30,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: TEST_UNIT.name,
};

export const DELETABLE_PRODUCT: FullProduct = {
  id: 'test-deletable-1',
  name: 'Deletable Widget',
  sku: 'DELETE-ME-001',
  description: 'Product para delete-on sa e2e test.',
  price: 60,
  stock: 20,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: TEST_UNIT.name,
};

/** Dedicated nga product para sa inventory stock-adjustment test. */
export const INVENTORY_PRODUCT: FullProduct = {
  id: 'test-inventory-1',
  name: 'Inventory Stock Item',
  sku: 'INV-ADJ-001',
  description: 'Product para sa stock-adjustment test.',
  price: 10,
  stock: 100,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: TEST_UNIT.name,
};

/**
 * Dedicated nga PERISHABLE product para sa expiration-date test. Bulag gikan sa
 * INVENTORY_PRODUCT aron ang is_perishable flag dili makaguba sa existing
 * inventory-adjust spec (nga wala nagdahom ug expiry field sa dialog).
 */
export const PERISHABLE_PRODUCT: FullProduct = {
  id: 'test-perishable-1',
  name: 'Perishable Stock Item',
  sku: 'PERISH-001',
  description: 'Product para sa expiration-date test.',
  price: 45,
  stock: 50,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: TEST_UNIT.name,
};

/**
 * Family para sa "expiry lands on the wrong product" regression test.
 * PERISHABLE_FAMILY_PARENT is a non-perishable, top-level root (unit "Box").
 * PERISHABLE_FAMILY_CHILD is its perishable child (unit "Piece", factor 12/box).
 *
 * Adjusting the CHILD must apply the entered expiration date to the CHILD's own
 * batch. The cascaded stock added to the PARENT (and any other family member)
 * must stay NULL — it inherits no date, by design. Before the fix, `addFamilyStock`
 * applied the expiry at `depth === 0` of the walk rooted at the family's ultimate
 * root, which is the PARENT, not the product actually being adjusted.
 */
export const PERISHABLE_FAMILY_PARENT: FullProduct = {
  id: 'test-perishable-family-parent',
  name: 'Perishable Family Parent',
  sku: 'PERISH-FAM-PAR-001',
  description: 'Non-perishable root product para sa expiry-target regression test.',
  price: 300,
  stock: 10,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Box',
};

export const PERISHABLE_FAMILY_CHILD: FullProduct & { parentId: string } = {
  id: 'test-perishable-family-child',
  name: 'Perishable Family Child',
  sku: 'PERISH-FAM-CHD-001',
  description: 'Perishable child unit para sa expiry-target regression test.',
  price: 30,
  stock: 0,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Piece',
  parentId: PERISHABLE_FAMILY_PARENT.id,
};

/**
 * Family para sa child-reassignment test. REASSIGN_PARENT_A is the current mother of
 * REASSIGN_CHILD (unit "Piece", factor 12 per box). REASSIGN_PARENT_B is an unrelated
 * top-level product the child gets moved under.
 */
export const REASSIGN_PARENT_A: FullProduct = {
  id: 'test-reassign-parent-a',
  name: 'Reassign Parent A',
  sku: 'RSN-PAR-A-001',
  description: 'Original mother product para sa reassign test.',
  price: 120,
  stock: 10,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Box',
};

export const REASSIGN_PARENT_B: FullProduct = {
  id: 'test-reassign-parent-b',
  name: 'Reassign Parent B',
  sku: 'RSN-PAR-B-001',
  description: 'New mother product para sa reassign test.',
  price: 150,
  stock: 5,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Box',
};

export const REASSIGN_CHILD: FullProduct & { parentId: string } = {
  id: 'test-reassign-child',
  name: 'Reassign Child Piece',
  sku: 'RSN-CHD-001',
  description: 'Child unit nga i-reassign.',
  price: 12,
  stock: 0,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Piece',
  parentId: REASSIGN_PARENT_A.id,
};

/**
 * Dedicated family para sa TOP-LEVEL reassignment test. REASSIGN_TOP_MOVER is a
 * top-level (parent_id NULL) mother nga naay usa ka anak (REASSIGN_TOP_MOVER_CHILD,
 * unit "Piece", factor 6). REASSIGN_TOP_TARGET is an unrelated top-level product nga
 * padulngan sa mover. Bulag ni sa REASSIGN_PARENT_* family aron walay cross-test coupling.
 */
export const REASSIGN_TOP_MOVER: FullProduct = {
  id: 'test-reassign-top-mover',
  name: 'Reassign Top Mover',
  sku: 'RSN-TOP-MVR-001',
  description: 'Top-level mother nga i-move under a new parent.',
  price: 200,
  stock: 8,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Box',
};

export const REASSIGN_TOP_TARGET: FullProduct = {
  id: 'test-reassign-top-target',
  name: 'Reassign Top Target',
  sku: 'RSN-TOP-TGT-001',
  description: 'Bag-ong parent para sa top-level mover.',
  price: 500,
  stock: 3,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Case',
};

export const REASSIGN_TOP_MOVER_CHILD: FullProduct & { parentId: string } = {
  id: 'test-reassign-top-mover-child',
  name: 'Reassign Top Mover Child',
  sku: 'RSN-TOP-CHD-001',
  description: 'Anak sa mover — kinahanglan magpabilin nested human sa move.',
  price: 34,
  stock: 0,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Piece',
  parentId: REASSIGN_TOP_MOVER.id,
};

/**
 * Dedicated, FULLY INDEPENDENT family para sa "Reassign factor auto-detect" test.
 * Wala ni gigamit/gi-mutate sa bisan unsang laing test — mao nga kini nga mover
 * magpabilin gyud nga top-level, ug ang no-match target magpabilin gyud nga
 * walay factor, bisan unsa pa ang order sa pag-execute sa spec file.
 *
 * REASSIGN_AUTO_MOVER — top-level product nga i-open/reassign (unit "Box").
 * REASSIGN_AUTO_MATCH — top-level target nga NAAY na conversion_factors row para
 *   sa mover's unit ("Box", factor 4) → auto-detect fires.
 * REASSIGN_AUTO_NOMATCH — top-level target nga WALAY factor para sa mover's unit
 *   → genuine blank case.
 */
export const REASSIGN_AUTO_MOVER: FullProduct = {
  id: 'test-reassign-auto-mover',
  name: 'Reassign Auto Mover',
  sku: 'RSN-AMV-001',
  description: 'Top-level mover nga dedicado sa auto-detect test.',
  price: 220,
  stock: 4,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Box',
};

export const REASSIGN_AUTO_MATCH: FullProduct = {
  id: 'test-reassign-auto-match',
  name: 'Reassign Auto Match Target',
  sku: 'RSN-AMT-001',
  description: 'Top-level nga naay Box factor — auto-detect dapat mo-fire.',
  price: 410,
  stock: 2,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Case',
};

export const REASSIGN_AUTO_NOMATCH: FullProduct = {
  id: 'test-reassign-auto-nomatch',
  name: 'Reassign Auto No Match Target',
  sku: 'RSN-ANM-001',
  description: 'Top-level nga walay Box factor — genuine blank case.',
  price: 415,
  stock: 2,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: 'Case',
};

/** Supplier + warehouse para sa purchase-order test. */
export const TEST_SUPPLIER = { id: 'sup-test', name: 'Test Supplier Co.' };
export const TEST_WAREHOUSE = { id: 'wh-test', name: 'Test Warehouse' };

/**
 * Product nga naka-assign sa TEST_WAREHOUSE — gikinahanglan sa bulk-price-update
 * e2e test kay ang Pricing page's product picker mo-filter pinaagi
 * sa warehouse_id, ug ang TEST_PRODUCTS naa'y NULL warehouse_id (dili sila
 * motungha bisan unsang warehouse ang piliin).
 */
export const BULK_PRICE_PRODUCT = {
  id: 'test-bulk-price-product-1',
  name: 'Bulk Price Update Product',
  sku: 'BULK-PRC-001',
  barcode: '4800000099999',
  price: 100,
  cost: 60,
  stock: 20,
  warehouseId: TEST_WAREHOUSE.id,
};

/**
 * Product nga naka-link sa TEST_SUPPLIER — gikinahanglan kay ang PO ProductSelector
 * mo-filter sa products pinaagi sa gipili nga supplier (products nga walay maong
 * supplier dili motungha).
 */
export const PO_PRODUCT = {
  id: 'test-po-product-1',
  name: 'PO Line Item',
  sku: 'PO-ITEM-001',
  price: 25,
  cost: 18,
  stock: 0,
  supplierId: TEST_SUPPLIER.id,
};

/** Customer para sa sales-order flow (ang SO nagkinahanglan ug customer_id). */
export const SO_CUSTOMER = { id: 'cust-so-test', name: 'SO Test Customer' };

/**
 * Stocked nga produkto para sa sales-order delivery.
 *
 * Ang stock 50 gituyo nga taas: ang delivery test mo-deduct gikan niini, ug
 * ang assertions nag-compare sa before/after imbes sa fixed nga numero, mao
 * nga dili sila magkabangi bisan mag-uban ang mga test sa usa ka run.
 */
export const SO_PRODUCT = {
  id: 'test-so-product-1',
  name: 'SO Line Item',
  sku: 'SO-ITEM-001',
  price: 120,
  cost: 80,
  stock: 50,
};

/**
 * Serbisyo para sa sales-order flow.
 *
 * Kini nag-cover sa bug diin ang usa ka SO nga naay serbisyo DILI ma-deliver:
 * ang delivery route mo-check ug stock sa matag linya, ug ang serbisyo kanunay
 * naa sa 0, mao nga na-block ang tibuok order.
 */
export const SO_SERVICE = {
  id: 'test-so-service-1',
  name: 'SO Service Line',
  sku: 'SO-SVC-001',
  price: 500,
  cost: 200,
  stock: 0,
};

/** Bag-ong product nga himuon sa Selling Units add test (2 units). */
export const SELLING_UNITS_NEW_PRODUCT = {
  name: 'QA Selling Units Widget',
  description: 'Product created by the e2e Selling Units add test.',
  baseUnitName: 'Piece',
  baseBarcode: '5100000000011',
  baseCost: 8,
  baseRetail: 12,
  baseWholesale: 11,
  boxUnitName: 'Box',
  boxQtyBase: 12,
  boxBarcode: '5100000000028',
  boxCost: 96,
  boxRetail: 140,
  boxWholesale: 130,
  stock: 24,
};

/**
 * A product that already carries selling units, standing in for one that came
 * out of the Plan 1 data migration. Its rows are seeded directly into
 * product_selling_units / product_selling_unit_prices, NOT through the UI, so
 * the edit test genuinely exercises loading stored rows into the tab.
 */
export const SELLING_UNITS_PRODUCT: FullProduct & {
  barcode: string;
  cost: number;
  units: {
    id: string;
    unitName: string;
    qtyBase: number;
    barcode: string;
    cost: number;
    price: number;
    isBase: boolean;
    sortOrder: number;
    retail: number;
    wholesale: number;
  }[];
} = {
  id: 'test-selling-units-1',
  name: 'Selling Units Sardines',
  sku: 'SU-EDIT-001',
  description: 'Product nga naa nay selling units para sa edit test.',
  price: 25,
  stock: 60,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: TEST_UNIT.name,
  barcode: '5200000000014',
  cost: 18,
  units: [
    {
      id: 'psu-su-edit-base',
      unitName: 'Piece',
      qtyBase: 1,
      barcode: '5200000000014',
      cost: 18,
      price: 25,
      isBase: true,
      sortOrder: 0,
      retail: 25,
      wholesale: 23,
    },
    {
      id: 'psu-su-edit-case',
      unitName: 'Case',
      qtyBase: 24,
      barcode: '5200000000021',
      cost: 420,
      price: 580,
      isBase: false,
      sortOrder: 1,
      retail: 580,
      wholesale: 540,
    },
  ],
};

/**
 * Destination warehouse para sa bulk-transfer tests. Ang TEST_WAREHOUSE mao ang
 * source, kini ang target — nagkinahanglan ta duha aron matinuod nga transfer
 * (source != target) ang ma-exercise.
 */
export const TRANSFER_TARGET_WAREHOUSE = { id: 'wh-xfer-dest', name: 'Transfer Destination' };

/**
 * Produkto nga NAA sa duha ka warehouse apan WALAY SKU (sku = NULL).
 *
 * Ang SKU optional sa product form (`sku: formData.sku || null`), mao nga NULL
 * usa ka normal nga estado — dili edge case. Gi-pares kini nga fixture aron
 * ma-regress ang bug diin ang bulk-transfer nag-resolve sa target pinaagi ra sa
 * `WHERE sku = ?`: sa SQL ang `sku = NULL` dili gyud mo-match, mao nga ang
 * transfer mo-500 bisan tuod naa na ang produkto sa target warehouse.
 */
export const TRANSFER_NULL_SKU_SOURCE = {
  id: 'test-xfer-nullsku-src',
  name: 'Transfer No SKU Product',
  barcode: '5300000000011',
  price: 90,
  cost: 55,
  stock: 20,
  warehouseId: TEST_WAREHOUSE.id,
};

/** Ang parehas nga produkto sa target warehouse — parehas og name ug barcode, NULL gihapon ang SKU. */
export const TRANSFER_NULL_SKU_TARGET = {
  id: 'test-xfer-nullsku-dest',
  name: TRANSFER_NULL_SKU_SOURCE.name,
  barcode: TRANSFER_NULL_SKU_SOURCE.barcode,
  price: 90,
  cost: 55,
  stock: 3,
  warehouseId: TRANSFER_TARGET_WAREHOUSE.id,
};

/**
 * Produkto nga naa RA sa source warehouse — walay katugbang sa target.
 *
 * Gigamit sa auto-create path: ang canonical nga transfer service mo-INSERT ug
 * bag-ong product row sa target warehouse imbes mo-throw, ug kinahanglan parehas
 * ang buhaton sa bulk endpoint.
 */
export const TRANSFER_ORPHAN_PRODUCT = {
  id: 'test-xfer-orphan-src',
  name: 'Transfer Orphan Product',
  sku: 'XFER-ORPH-001',
  barcode: '5300000000028',
  price: 140,
  cost: 95,
  stock: 12,
  warehouseId: TEST_WAREHOUSE.id,
};
