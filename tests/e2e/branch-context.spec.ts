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
