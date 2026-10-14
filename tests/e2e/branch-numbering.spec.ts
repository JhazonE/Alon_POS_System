import { test, expect } from '@playwright/test';
import { getNextSINumber, getNextMCNumber, getNextBirOrNumber } from '../../lib/mysql';
import { seedSecondBranch, cleanupSecondBranch } from './helpers/branches';

/**
 * Pure nga tests — walay `page` fixture. Kada branch kay kaugalingong BIR
 * series: dili mag-sagol, dili mag-gap.
 */
test.describe('per-branch BIR counters', () => {
  test('ang duha ka branch adunay independent nga SI series', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    try {
      const a1 = await getNextSINumber(a.branchId);
      const b1 = await getNextSINumber(b.branchId);
      const a2 = await getNextSINumber(a.branchId);

      expect(a1).toBe('000001');
      expect(b1).toBe('000001'); // parehas nga numero, lain nga branch
      expect(a2).toBe('000002'); // wala na-apektuhan sa branch B
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('walay gap ang series sa sunod-sunod nga pag-issue', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    try {
      const nums: string[] = [];
      for (let i = 0; i < 5; i++) nums.push(await getNextSINumber(a.branchId));
      expect(nums).toEqual(['000001', '000002', '000003', '000004', '000005']);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang MC ug OR series kay independent sab per branch', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    try {
      expect(await getNextMCNumber(a.branchId)).toBe('MC-000001');
      expect(await getNextMCNumber(b.branchId)).toBe('MC-000001');
      expect(await getNextBirOrNumber(a.branchId)).toBe('OR-000001');
      expect(await getNextBirOrNumber(b.branchId)).toBe('OR-000001');
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('mo-fail closed ang branch nga walay series row — dili mo-fallback sa main', async () => {
    const a = await seedSecondBranch({ withNumberSeries: false });
    try {
      await expect(getNextSINumber(a.branchId)).rejects.toThrow(
        /no number series/i
      );
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('mo-fail closed sa wala-kaila nga branch id', async () => {
    await expect(getNextSINumber('does-not-exist')).rejects.toThrow(
      /no number series/i
    );
  });
});
