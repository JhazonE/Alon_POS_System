import { test, expect } from '@playwright/test';
import {
  assertHeadOffice,
  BranchResolutionError,
  ALL_BRANCHES_PERMISSION,
} from '../../lib/branch-context';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  grantPermission,
  setUserBranch,
} from './helpers/branches';

/**
 * Branch administration — pure nga tests sa authorisation helper, walay `page`.
 * Ang Tasks 4-7 mo-append niini nga file.
 */
test.describe('assertHeadOffice', () => {
  test('ang head office (all_branches, walay branch) pasar', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(seeded.userUid, null);
      await expect(assertHeadOffice(seeded.userUid)).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang user nga naay branch UG all_branches pasar gihapon — ang grant ra ang gi-check', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      await expect(assertHeadOffice(seeded.userUid)).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang branch-scoped user nga walay grant gi-reject ug 403', async () => {
    const seeded = await seedSecondBranch();
    try {
      const err = await assertHeadOffice(seeded.userUid).catch((e) => e);
      expect(err).toBeInstanceOf(BranchResolutionError);
      expect(err.status).toBe(403);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang wala-kaila nga uid gi-reject ug 403', async () => {
    const err = await assertHeadOffice('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(BranchResolutionError);
    expect(err.status).toBe(403);
  });

  test('ang empty-string nga uid gi-reject', async () => {
    const err = await assertHeadOffice('').catch((e) => e);
    expect(err).toBeInstanceOf(BranchResolutionError);
    expect(err.status).toBe(403);
  });

  test('ang non-string nga uid (object) gi-reject, dili mo-match ug row', async () => {
    // pool.query mo-escape sa object ingon `key` = value, mao nga ang {branch_id: 0}
    // mahimong match-many predicate. Kinahanglan i-reject sa wala pa ang query.
    // Aduna'y head-office user sa DB aron kung mo-leak ang check, mo-pass kini.
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      for (const bad of [{ branch_id: 0 }, { uid: 1 }, 0, 1, null, undefined, ['x']]) {
        const err = await assertHeadOffice(bad as unknown as string).catch((e) => e);
        expect(err, `uid=${JSON.stringify(bad)}`).toBeInstanceOf(BranchResolutionError);
        expect(err.status).toBe(403);
      }
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });
});
