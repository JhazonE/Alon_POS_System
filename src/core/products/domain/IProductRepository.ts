import { ProductEntity } from './Product';

export interface GetProductsFilters {
  category?: string | null;
  department?: string | null;
  search?: string | null;
  warehouseId?: string | null;
  availability?: string | null;
  supplierId?: string | null;
  shelfLocationId?: string | null; // @deprecated: Use shelfId
  shelfId?: string | null;
  /**
   * POS only. Returns one row per selling unit instead of one row per product.
   * Opt-in because the other 10 `useProducts` consumers (purchase orders, bad
   * orders, purchases list) must keep seeing one row per product.
   */
  expandSellingUnits?: boolean;
}

export interface ProductRepository {
  findAll(limit: number, offset: number, filters: GetProductsFilters): Promise<ProductEntity[]>;
  countAll(filters: GetProductsFilters): Promise<number>;
  findById(id: string): Promise<ProductEntity | null>;
  create(product: Partial<ProductEntity>): Promise<string>;
  update(id: string, product: Partial<ProductEntity>): Promise<void>;
  delete(id: string): Promise<void>;
}
