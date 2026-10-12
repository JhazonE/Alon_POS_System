import { test, expect } from '@playwright/test';
import {
  resolveTerminalBranch,
  clientIpFrom,
  BranchResolutionError,
} from '../../lib/branch-context';
import { seedSecondBranch, cleanupSecondBranch } from './helpers/branches';

/**
 * Pure nga tests — walay `page` fixture. Ang branch kay gikan sa DB nga
 * terminal record, dili gikan sa gi-claim sa client.
 */
test.describe('resolveTerminalBranch', () => {
  test('mo-uli sa branch sa registered terminal', async () => {
    const seeded = await seedSecondBranch();
    try {
      const result = await resolveTerminalBranch(seeded.terminalId);
      expect(result.scope).toBe('single');
      expect(result.branchId).toBe(seeded.branchId);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung wala pa ma-assign ang terminal sa branch', async () => {
    const seeded = await seedSecondBranch({ terminalBranchId: null });
    try {
      await expect(resolveTerminalBranch(seeded.terminalId)).rejects.toThrow(
        /not assigned to a branch/i
      );
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung inactive ang branch sa terminal', async () => {
    const seeded = await seedSecondBranch({ branchActive: false });
    try {
      await expect(resolveTerminalBranch(seeded.terminalId)).rejects.toThrow(
        /inactive/i
      );
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed sa wala-kaila nga terminal id', async () => {
    await expect(resolveTerminalBranch('does-not-exist')).rejects.toThrow(
      /unknown terminal/i
    );
  });

  test('ang error kay 403, dili 500', async () => {
    const err = await resolveTerminalBranch('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(BranchResolutionError);
    expect(err.status).toBe(403);
  });
});

test.describe('clientIpFrom — spoofing', () => {
  test('gi-gamit ang x-forwarded-for pero DILI kini mahimong branch source', () => {
    // Gi-dokumento nga limitation: spoofable ang header. Ang branch kay
    // gikan gihapon sa terminal record sa DB, dili sa IP.
    const req = new Request('http://localhost/api/x', {
      headers: { 'x-forwarded-for': '10.0.0.99, 10.0.0.1' },
    });
    expect(clientIpFrom(req)).toBe('10.0.0.99');
  });

  test('mo-fallback sa 127.0.0.1 kung walay header', () => {
    const req = new Request('http://localhost/api/x');
    expect(clientIpFrom(req)).toBe('127.0.0.1');
  });
});

import { resolveUserBranch, ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';
import { grantPermission, setUserBranch } from './helpers/branches';

test.describe('resolveUserBranch', () => {
  test('mo-uli sa assigned branch sa user', async () => {
    const seeded = await seedSecondBranch();
    try {
      const result = await resolveUserBranch(seeded.userUid);
      expect(result).toEqual({ branchId: seeded.branchId, scope: 'single' });
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang head office (NULL branch + all_branches) mo-uli ug scope "all"', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(seeded.userUid, null);
      const result = await resolveUserBranch(seeded.userUid);
      expect(result).toEqual({ branchId: null, scope: 'all' });
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang head office makahimo mo-switch pinaagi sa viewBranchId', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      const result = await resolveUserBranch(seeded.userUid, seeded.branchId);
      expect(result).toEqual({ branchId: seeded.branchId, scope: 'single' });
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('gi-REJECT ang viewBranchId kung walay all_branches — dili hilom nga i-downgrade', async () => {
    const seeded = await seedSecondBranch();
    const other = await seedSecondBranch();
    try {
      await expect(
        resolveUserBranch(seeded.userUid, other.branchId)
      ).rejects.toThrow(/not permitted to view other branches/i);
    } finally {
      await cleanupSecondBranch(other);
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung inactive ang branch sa user', async () => {
    const seeded = await seedSecondBranch({ branchActive: false });
    try {
      await expect(resolveUserBranch(seeded.userUid)).rejects.toThrow(/inactive/i);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung NULL ang branch pero walay all_branches', async () => {
    const seeded = await seedSecondBranch();
    try {
      await setUserBranch(seeded.userUid, null);
      await expect(resolveUserBranch(seeded.userUid)).rejects.toThrow(
        /not assigned to a branch/i
      );
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });
});

import {
  assertWarehouseInBranch,
  warehouseIdsForBranch,
} from '../../lib/branch-context';

test.describe('assertWarehouseInBranch', () => {
  test('mo-pass kung ang warehouse sakop sa resolved branch', async () => {
    const seeded = await seedSecondBranch();
    try {
      await expect(
        assertWarehouseInBranch(seeded.warehouseId, {
          branchId: seeded.branchId,
          scope: 'single',
        })
      ).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('gi-REJECT ang warehouse sa laing branch bisan active ug valid kini', async () => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      await expect(
        assertWarehouseInBranch(b.warehouseId, {
          branchId: a.branchId,
          scope: 'single',
        })
      ).rejects.toThrow(/does not belong to branch/i);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office (scope "all") makasulod sa bisan unsang warehouse', async () => {
    const seeded = await seedSecondBranch();
    try {
      await expect(
        assertWarehouseInBranch(seeded.warehouseId, {
          branchId: null,
          scope: 'all',
        })
      ).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('gi-reject ang wala-kaila nga warehouse', async () => {
    await expect(
      assertWarehouseInBranch('nope', { branchId: 'x', scope: 'single' })
    ).rejects.toThrow(/unknown warehouse/i);
  });
});

test.describe('warehouseIdsForBranch', () => {
  test('mo-uli sa warehouse ids sa branch', async () => {
    const seeded = await seedSecondBranch();
    try {
      const ids = await warehouseIdsForBranch({
        branchId: seeded.branchId,
        scope: 'single',
      });
      expect(ids).toEqual([seeded.warehouseId]);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-uli ug null para sa scope "all" — pasabot walay filter', async () => {
    const ids = await warehouseIdsForBranch({ branchId: null, scope: 'all' });
    expect(ids).toBeNull();
  });
});

import { mainBranchId } from '../../lib/branch-context';
import { MySqlWarehouseRepository } from '../../src/infrastructure/repositories/MySqlWarehouseRepository';
import { query } from '../../lib/mysql';

test.describe('mainBranchId', () => {
  test('mo-uli sa id sa seeded nga main branch', async () => {
    const rows = (await query(
      'SELECT id FROM branches WHERE is_main = 1'
    )) as any[];
    expect(rows).toHaveLength(1);
    expect(await mainBranchId()).toBe(rows[0].id);
  });

  test('ang bag-ong warehouse nga walay gihatag nga branch mapunta sa main branch', async () => {
    const id = `wh-default-${Date.now()}`;
    try {
      await new MySqlWarehouseRepository().create({ id, name: 'Default Branch WH' });
      const rows = (await query(
        'SELECT branch_id AS branchId FROM warehouses WHERE id = ?',
        [id]
      )) as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].branchId).toBe(await mainBranchId());
    } finally {
      await query('DELETE FROM warehouses WHERE id = ?', [id]);
    }
  });
});
