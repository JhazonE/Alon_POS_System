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
    const fallback = `SU-${fallbackSourceId}`;
    usedBarcodes.add(fallback);
    return fallback;
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
      unitName: root.unitOfMeasure || 'Unit',
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
        const childCumulative = cumulativeFactor * (immediateFactor || 1);

        const sellingUnitId = generateId();
        sellingUnits.push({
          id: sellingUnitId,
          rootProductId: root.id,
          sourceProductId: child.id,
          unitName: child.unitOfMeasure || 'Unit',
          qtyBase: childCumulative,
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

  return { sellingUnits, deletedProductIds, reassignments };
}
