export interface PriceInquiryDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  activeLevelId?: string;
  defaultLevelId?: string;
  activeLevelName?: string;
  /** The terminal's warehouse. `null` = unresolved: list nothing (see useProducts). */
  warehouseId?: string | null;
  /** False until the terminal is known; holds the product query. */
  enabled?: boolean;
}
