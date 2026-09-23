export interface MigrationProductInput {
  id: string;
  parentId: string | null;
  unitOfMeasure: string | null;
  barcode: string | null;
  cost: number | null;
  price: number;
  conversionFactor: number | null;
}

export interface MigrationConversionFactorInput {
  productId: string; // the parent product's id
  unit: string;       // matches the child's unit_of_measure
  factor: number;
}

export interface PlannedSellingUnit {
  id: string;
  rootProductId: string;
  sourceProductId: string;
  unitName: string;
  qtyBase: number;
  barcode: string;
  cost: number | null;
  price: number;
  isBase: boolean;
  sortOrder: number;
}

export interface MigrationPlan {
  sellingUnits: PlannedSellingUnit[];
  /** Deepest-first: safe to DELETE FROM products in this exact order. */
  deletedProductIds: string[];
  reassignments: Array<{ fromProductId: string; toRootProductId: string; sellingUnitId: string }>;
}

let fallbackIdCounter = 0;
function defaultIdGenerator(): string {
  fallbackIdCounter += 1;
  return `psu_${Date.now()}_${fallbackIdCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function computeSellingUnitsPlan(
  products: MigrationProductInput[],
  conversionFactors: MigrationConversionFactorInput[],
  generateId: () => string = defaultIdGenerator
): MigrationPlan {
  const childrenOf = new Map<string, MigrationProductInput[]>();
  for (const p of products) {
    if (p.parentId != null) {
      const list = childrenOf.get(p.parentId) || [];
      list.push(p);
      childrenOf.set(p.parentId, list);
    }
  }

  const cfMap = new Map<string, number>();
  for (const cf of conversionFactors) {
    cfMap.set(`${cf.productId}::${cf.unit}`, cf.factor);
  }

  const usedBarcodes = new Set<string>();
  function resolveBarcode(candidate: string | null, fallbackSourceId: string): string {
    const trimmed = (candidate || '').trim();
    if (trimmed && !usedBarcodes.has(trimmed)) {
      usedBarcodes.add(trimmed);
      return trimmed;
    }
    // product_selling_units has UNIQUE(barcode), so the synthetic fallback has
    // to be genuinely free too — a real product's barcode could literally be
    // the string "SU-<some id>". Keep suffixing until nothing claims it.
    let fallback = `SU-${fallbackSourceId}`;
    let suffix = 1;
    while (usedBarcodes.has(fallback)) {
      suffix += 1;
      fallback = `SU-${fallbackSourceId}-${suffix}`;
    }
    usedBarcodes.add(fallback);
    return fallback;
  }

  // product_selling_units has UNIQUE(product_id, unit_name), so unit names only
  // have to be unique *within one root product*, not globally. Real families do
  // have two children sharing a unit_of_measure (e.g. two "Piece" children under
  // one parent); without this the first INSERT for such a family throws
  // ER_DUP_ENTRY and aborts the whole migration.
  const usedUnitNames = new Map<string, Set<string>>();
  function resolveUnitName(rootProductId: string, candidate: string): string {
    let taken = usedUnitNames.get(rootProductId);
    if (!taken) {
      taken = new Set<string>();
      usedUnitNames.set(rootProductId, taken);
    }
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
    let suffix = 1;
    let name = candidate;
    while (taken.has(name)) {
      suffix += 1;
      name = `${candidate} (${suffix})`;
    }
    taken.add(name);
    return name;
  }

  const sellingUnits: PlannedSellingUnit[] = [];
  const reassignments: MigrationPlan['reassignments'] = [];

  const roots = products.filter(p => p.parentId == null);

  const deletedProductIds: string[] = [];

  for (const root of roots) {
    let sortOrder = 0;
    sellingUnits.push({
      id: generateId(),
      rootProductId: root.id,
      sourceProductId: root.id,
      unitName: resolveUnitName(root.id, root.unitOfMeasure || 'Unit'),
      qtyBase: 1,
      barcode: resolveBarcode(root.barcode, root.id),
      cost: root.cost,
      price: root.price,
      isBase: true,
      sortOrder: sortOrder++,
    });

    const walk = (node: MigrationProductInput, cumulativeFactor: number) => {
      const children = childrenOf.get(node.id) || [];
      for (const child of children) {
        const cfFactor = cfMap.get(`${node.id}::${child.unitOfMeasure || ''}`);
        const immediateFactor = cfFactor ?? child.conversionFactor ?? 1;
        // A factor of exactly 0 is NOT null — it would silently sail past a
        // null-only check here and then get coerced to 1 by the `|| 1` below,
        // which is exactly the kind of bad-data case this warning exists to
        // catch. Warn on either: no factor was found at all (null in both
        // sources), OR one WAS found but it's unusable (falsy, i.e. 0).
        if ((cfFactor == null && child.conversionFactor == null) || !immediateFactor) {
          console.warn(
            `⚠️  selling-units migration: no usable conversion factor found for child product ${child.id} ` +
            `(unit "${child.unitOfMeasure ?? ''}" under parent ${node.id}) — defaulting to 1. ` +
            `Verify this product's qty_base after migrating.`
          );
        }
        // A conversion_factors row means "1 parent unit = factor child units"
        // (see lib/family-sync.ts findUltimateRoot). childCumulative is
        // therefore how many of THIS child's unit make up one root/base unit.
        const childCumulative = cumulativeFactor * (immediateFactor || 1);

        const sellingUnitId = generateId();
        sellingUnits.push({
          id: sellingUnitId,
          rootProductId: root.id,
          sourceProductId: child.id,
          unitName: resolveUnitName(root.id, child.unitOfMeasure || 'Unit'),
          // qty_base = how many BASE units one of this unit equals. The root
          // stays the base (qty_base = 1) and is the bigger unit, so a
          // descendant is worth 1/composed-factor of a base unit — e.g. with
          // 1 Box = 12 Piece, one Piece is 1/12 of a Box.
          qtyBase: 1 / childCumulative,
          barcode: resolveBarcode(child.barcode, child.id),
          cost: child.cost,
          price: child.price,
          isBase: false,
          sortOrder: sortOrder++,
        });
        reassignments.push({ fromProductId: child.id, toRootProductId: root.id, sellingUnitId });

        // Recurse into this child's own children (if it was itself a parent)
        // before marking it for deletion, so every descendant collapses onto
        // the same root and deletedProductIds stays deepest-first.
        walk(child, childCumulative);

        deletedProductIds.push(child.id);
      }
    };

    walk(root, 1);
  }

  // Every input product must end up represented by exactly one selling unit.
  // A parent_id cycle (or a parent_id pointing at a missing row) would leave a
  // product unreachable from any root and silently orphan it — fail loudly
  // instead of migrating a partial picture.
  const covered = new Set(sellingUnits.map(u => u.sourceProductId));
  const orphaned = products.filter(p => !covered.has(p.id)).map(p => p.id);
  if (orphaned.length > 0) {
    throw new Error(
      `selling-units migration planner: ${orphaned.length} product(s) were not reachable from any root ` +
      `and would be silently dropped: ${orphaned.join(', ')}. ` +
      `This usually means a parent_id cycle or a parent_id pointing at a non-existent product.`
    );
  }

  return { sellingUnits, deletedProductIds, reassignments };
}

/**
 * Converts a quantity denominated in a child selling unit into root-equivalent
 * base units, using the same qty_base factor computeSellingUnitsPlan already
 * assigns that unit (how many base units one of this unit equals).
 */
export function convertChildQuantityToBase(quantity: number, qtyBase: number): number {
  return quantity * qtyBase;
}

/**
 * Converts a per-unit cost denominated in a child selling unit into a
 * root-equivalent (base-unit) per-unit cost. Inverts qty_base (rather than
 * multiplying, like the quantity conversion above) so that total peso value
 * is preserved: (quantity * qtyBase) * (unitCost / qtyBase) === quantity * unitCost.
 */
export function convertChildUnitCostToBase(unitCost: number, qtyBase: number): number {
  if (qtyBase <= 0) {
    throw new Error(`Cannot convert unit cost with qty_base <= 0 (got ${qtyBase})`);
  }
  return unitCost / qtyBase;
}
