import type { SaleItem } from '../pos-content/pos-types';

export type CancelScope = 'selected' | 'all';

export interface CancelItemsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Cancel the whole selected line. */
  onCancelSelected: () => void;
  /** Clear every line in the cart. */
  onCancelAll: () => void;
  selectedItem: SaleItem | null;
  itemCount: number;
}
