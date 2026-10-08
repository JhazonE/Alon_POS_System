/**
 * Which price level prices the POS cart, and what happens to a cashier's
 * manual pick when the customer changes.
 *
 * Pure, so the precedence rule is testable without React — the POS hook holds
 * the state, this decides what it means.
 */

/** A level id that is actually set. '' and null both mean "unassigned". */
function isSet(levelId: string | null | undefined): levelId is string {
  return typeof levelId === 'string' && levelId !== '';
}

/**
 * The level the cart is priced at, in order:
 *   1. the customer's OWN level — contract pricing a cashier must not undercut
 *      by leaving a pick from a previous sale in place;
 *   2. the cashier's manual pick — the walk-in case this switcher exists for;
 *   3. the default level.
 *
 * Note that a level winning here does NOT mean its prices are charged
 * regardless of quantity: `resolvePriceLevel` falls back to the default level
 * and then the base price when the active level has no qualifying row, so a
 * tier priced at 10+ leaves quantities 1-9 at the normal price.
 */
export function resolveActivePriceLevelId(
  customerLevelId: string | null | undefined,
  manualLevelId: string | null | undefined,
  defaultLevelId: string,
): string {
  if (isSet(customerLevelId)) return customerLevelId;
  if (isSet(manualLevelId)) return manualLevelId;
  return defaultLevelId;
}

/**
 * The manual pick to keep after a customer is selected.
 *
 * Selecting a customer who carries their own level clears the pick. Without
 * this the pick would survive as hidden state that the customer's level merely
 * outranks, and switching back to walk-in would silently resurrect a level the
 * cashier chose for an earlier sale.
 */
export function manualPickAfterCustomerChange(
  customerLevelId: string | null | undefined,
  manualLevelId: string | null | undefined,
): string {
  if (isSet(customerLevelId)) return '';
  return isSet(manualLevelId) ? manualLevelId : '';
}

/**
 * Whether this sale may take a tier declared on another price level.
 *
 * Only for a sale with no declared level: a customer's own level is contract
 * pricing and a cashier's manual pick is deliberate, so both suppress it (spec
 * A2). `enabled` is the POS setting `enable_price_level_switch`.
 */
export function shouldAutoApplyTiers(
  enabled: boolean,
  customerLevelId: string | null | undefined,
  manualLevelId: string | null | undefined,
): boolean {
  if (!enabled) return false;
  return !isSet(customerLevelId) && !isSet(manualLevelId);
}

/**
 * How the cart is repriced when the active level or the automatic-tier gate
 * changes.
 *
 * The gate can flip for two different reasons. A cashier action (switching level,
 * picking the default level) must reprice fully. But the POS settings arriving
 * for the first time at startup also flips the gate (false -> true) when the
 * store has the switch enabled; that is async data arriving, not a decision, so
 * it may only refresh badges — a restored line may carry a price the cashier
 * typed by hand, and overwriting it would write a wrong unit price onto the
 * invoice.
 *
 * `settingsJustResolved` is true only for the change caused by the first load of
 * the POS settings.
 */
export function repriceModeForGateChange(settingsJustResolved: boolean): 'full' | 'labelsOnly' {
  return settingsJustResolved ? 'labelsOnly' : 'full';
}
