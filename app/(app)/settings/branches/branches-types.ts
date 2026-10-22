export interface Branch {
  id: string;
  code: string;
  name: string;
  businessName: string | null;
  address: string | null;
  tin: string | null;
  contactNumber: string | null;
  permitNo: string | null;
  minNumber: string | null;
  serialNumber: string | null;
  operatedBy: string | null;
  isMain: boolean | number;
  isActive: boolean | number | null;
}

export interface MemberWarehouse { id: string; name: string; branchId: string | null; isActive: boolean }
export interface MemberUser { uid: string; username: string; displayName: string | null; branchId: string | null; isActive: boolean }
export interface MemberTerminal { id: string; name: string | null; branchId: string | null; isActive: boolean }

export interface BranchMembers {
  warehouses: MemberWarehouse[];
  users: MemberUser[];
  terminals: MemberTerminal[];
}

export type ReassignKind = 'warehouse' | 'user' | 'terminal';

/**
 * What the admin is told when a write fails. 403 (not permitted) and 409
 * (refused because of current state, with counts in the message) are kept
 * apart on purpose: they call for different actions.
 */
export type FailureKind = 'forbidden' | 'refused' | 'error';

export type ActionResult = { ok: true } | { ok: false; kind: FailureKind; message: string };

export interface BranchFormValues {
  code: string;
  name: string;
  businessName: string;
  address: string;
  tin: string;
  contactNumber: string;
  permitNo: string;
  minNumber: string;
  serialNumber: string;
  operatedBy: string;
}

export const EMPTY_BRANCH_FORM: BranchFormValues = {
  code: '', name: '', businessName: '', address: '', tin: '',
  contactNumber: '', permitNo: '', minNumber: '', serialNumber: '', operatedBy: '',
};

/** Optional text fields shared by the create and edit forms. */
export const OPTIONAL_FIELDS: { name: keyof BranchFormValues; label: string }[] = [
  { name: 'businessName', label: 'Registered Business Name' },
  { name: 'address', label: 'Address' },
  { name: 'tin', label: 'TIN' },
  { name: 'contactNumber', label: 'Contact Number' },
  { name: 'permitNo', label: 'Permit No' },
  { name: 'minNumber', label: 'MIN' },
  { name: 'serialNumber', label: 'Serial Number' },
  { name: 'operatedBy', label: 'Operated By' },
];

export const isActiveFlag = (v: boolean | number | null | undefined) =>
  v === null || v === undefined ? true : Number(v) !== 0;
