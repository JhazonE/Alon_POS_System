import { test, expect } from '@playwright/test';
import { getSamePeriodLastMonth } from '../../lib/fiscal-utils';

/**
 * Pure nga tests — walay `page` fixture. Ang `lastMonthRevenue` window kay
 * same-period, dili tibuok bulan: kung itandi ang 11 ka adlaw karon batok sa
 * 31 ka adlaw sa milabay, permanente ug pagkaubos ang mapakita.
 */
test.describe('getSamePeriodLastMonth', () => {
  test('mid-month → parehas nga day-of-month sa milabay nga bulan', () => {
    const { start, end } = getSamePeriodLastMonth(new Date(2026, 8, 11)); // Sep 11
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7); // Aug
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(11);
  });

  test('ika-31 batok sa 30-day nga bulan → naka-clamp sa katapusan', () => {
    const { end } = getSamePeriodLastMonth(new Date(2026, 9, 31)); // Oct 31
    expect(end.getMonth()).toBe(8); // Sep
    expect(end.getDate()).toBe(30); // dili Oct 1
  });

  test('ika-29 sa Marso sa dili-leap nga tuig → naka-clamp sa Peb 28', () => {
    const { end } = getSamePeriodLastMonth(new Date(2026, 2, 29)); // Mar 29
    expect(end.getMonth()).toBe(1); // Feb
    expect(end.getDate()).toBe(28);
  });

  test('Enero → mo-rollback sa Disyembre sa milabay nga tuig', () => {
    const { start, end } = getSamePeriodLastMonth(new Date(2026, 0, 15)); // Jan 15
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11); // Dec
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getDate()).toBe(15);
  });
});

test.describe('GET /api/reports/stats — bag-ong summary fields', () => {
  test('mo-uli sa today, deltas, ug profit inputs', async ({ request }) => {
    const res = await request.get('/api/reports/stats');
    expect(res.ok()).toBeTruthy();
    const { summary } = await res.json();

    for (const key of [
      'todayRevenue', 'todaySales', 'yesterdayRevenue',
      'lastMonthRevenue', 'cogsMonth', 'costCoverageMonth',
    ]) {
      expect(summary, `nawala ang ${key}`).toHaveProperty(key);
      expect(Number.isFinite(summary[key]), `${key} dili numero`).toBe(true);
    }

    expect(Number.isInteger(summary.todaySales)).toBe(true);
    expect(summary.costCoverageMonth).toBeGreaterThanOrEqual(0);
    expect(summary.costCoverageMonth).toBeLessThanOrEqual(1);
  });

  test('walay gikuha nga existing field', async ({ request }) => {
    const res = await request.get('/api/reports/stats');
    const { summary } = await res.json();

    for (const key of [
      'totalRevenueAllTime', 'totalRevenueMonth', 'totalRevenueFiscalYTD',
      'fiscalYear', 'fiscalStartMonth', 'availableFiscalYears',
      'totalSalesMonth', 'productsSoldMonth', 'lowStockItems', 'totalItems',
    ]) {
      expect(summary, `na-regress ang ${key}`).toHaveProperty(key);
    }
  });
});
