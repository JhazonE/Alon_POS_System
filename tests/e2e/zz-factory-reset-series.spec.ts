import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  advanceSeries,
  readSeries,
} from './helpers/branches';

/**
 * Gi-file sa lain nga spec (ug ginganlan ug `zz-` aron mo-modagan kataposan
 * sa alphabetical order, workers: 1) kay ang `factory_reset` mo-truncate sa
 * products, pos_terminals, warehouses ug mo-delete sa non-admin users sa test
 * DB. Ang sunod nga run mo-rebuild sa DB pinaagi sa global setup.
 */
test.describe('factory_reset — ang series kinahanglan mo-reset sab', () => {
  test('ang factory_reset mo-reset sa branch_number_series', async ({ request }) => {
    const second = await seedSecondBranch({ withNumberSeries: true });
    try {
      await advanceSeries();

      const before = await readSeries();
      expect(before.length).toBeGreaterThanOrEqual(2);
      for (const row of before) {
        expect([row.si_number, row.mc_number, row.bir_or_number]).toEqual([
          '000042', '000042', '000042',
        ]);
      }

      const res = await request.post('/api/data-management/reset', {
        data: { action: 'factory_reset' },
      });
      const body = await res.json();
      expect(res.status()).toBe(200);
      expect(body.success).toBe(true);

      const after = await readSeries();
      // Ang rows kinahanglan mabuhi gihapon — kon mawala, walay branch nga
      // makapag-issue ug invoice.
      expect(after.length).toBe(before.length);
      for (const row of after) {
        expect([row.si_number, row.mc_number, row.bir_or_number]).toEqual([
          '000000', '000000', '000000',
        ]);
      }
    } finally {
      await cleanupSecondBranch(second);
    }
  });
});
