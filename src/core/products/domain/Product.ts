export interface ProductEntity {
  id: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  department?: string;
  stock: number;
  price: number;
  cost?: number;
  barcode?: string;
  vatStatus?: string;
  availability?: string;
  unitOfMeasure: string;
  reorderPoint: number;
  avgDailySales: number;
  expirationDate?: string;
  warehouseId?: string;
  shelfLocationId?: string | null; // @deprecated: Use shelfLocationIds
  shelfLocationIds?: string[];
  shelfQuantities?: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
  priceLevels?: ProductPriceLevel[];
}

export interface ProductPriceLevel {
  levelId: string;
  price: number;
  minQuantity: number;
}
