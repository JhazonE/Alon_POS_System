import type { Product } from '@/lib/types';

export interface ProductSearchDialogProps {
  onSelectProduct: (product: Product) => void;
  children?: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  showQuantityInSearch?: boolean;
  activeLevelId?: string;
  defaultLevelId?: string;
  activeLevelName?: string;
  /** `null` = the terminal has no resolvable warehouse: list nothing (see useProducts). */
  warehouseId?: string | null;
  allProducts?: Product[];
  /** False until the terminal is known; holds the product query. */
  enabled?: boolean;
}
