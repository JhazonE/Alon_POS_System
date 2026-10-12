import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import {
  resolveScopeFromRequest,
  saleBranchFilter,
  branchErrorResponse,
  type BranchScope,
} from '@/lib/branch-context';
import { getFiscalYearRange, getCurrentFiscalYear, formatFiscalYear, toLocalYmd } from '@/lib/fiscal-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Branch isolation. The scope comes from the database via uid, never
    // from a branch the caller claims.
    let branchScope: BranchScope;
    try {
      branchScope = await resolveScopeFromRequest(searchParams);
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }

    // Sales carry no warehouse column; a sale belongs to the branch of the
    // terminal that rang it. Every sales read below goes through this
    // scoped_sales CTE, so a branch only ever sees its own sales while head
    // office (no filter) reads the table exactly as before.
    const saleScope = saleBranchFilter(branchScope, 'st.id');
    const scopedSalesCte = `WITH scoped_sales AS (
      SELECT st.* FROM sales_transactions st${saleScope ? ` WHERE ${saleScope.sql}` : ''}
    )`;
    const scopedSalesParams: any[] = saleScope ? saleScope.params : [];

    const settingsResult = await query("SELECT fiscal_year_start_month FROM pos_settings LIMIT 1") as any[];
    const startMonth = settingsResult[0]?.fiscal_year_start_month || 1;

    const currentFiscalYear = getCurrentFiscalYear(startMonth);
    const requestedFy = parseInt(searchParams.get('fiscalYear') || '', 10);
    const fiscalYear = Number.isFinite(requestedFy) ? requestedFy : currentFiscalYear;

    const { startDate, endDate } = getFiscalYearRange(fiscalYear, startMonth);
    const startStr = toLocalYmd(startDate);
    const endStr = toLocalYmd(endDate);

    // Available fiscal years from earliest paid sale through current FY.
    const [firstSaleRow] = await query(
      `${scopedSalesCte} SELECT MIN(invoice_date) AS first_date FROM scoped_sales WHERE status = 'Paid'`,
      scopedSalesParams
    ) as any[];
    const availableFiscalYears: number[] = [];
    if (firstSaleRow?.first_date) {
      const firstFy = getCurrentFiscalYear(startMonth, new Date(firstSaleRow.first_date));
      for (let y = firstFy; y <= currentFiscalYear; y++) availableFiscalYears.push(y);
    } else {
      availableFiscalYears.push(currentFiscalYear);
    }

    // Fiscal-year summary (revenue + transactions from transactions; profit from items).
    const [summaryRow] = await query(
      `${scopedSalesCte}
       SELECT
         COALESCE(SUM(st.total), 0) AS revenue,
         COUNT(*) AS transactions
       FROM scoped_sales st
       WHERE st.status = 'Paid' AND st.invoice_date >= ? AND st.invoice_date <= ?`,
      [...scopedSalesParams, startStr, endStr]
    ) as any[];

    const [costRow] = await query(
      `${scopedSalesCte}
       SELECT COALESCE(SUM(si.quantity * COALESCE(si.cost_at_sale, p.cost, 0)), 0) AS cost
       FROM sale_items si
       JOIN scoped_sales st ON si.sale_id = st.id
       JOIN products p ON si.product_id = p.id
       WHERE st.status = 'Paid' AND st.invoice_date >= ? AND st.invoice_date <= ?`,
      [...scopedSalesParams, startStr, endStr]
    ) as any[];

    const revenue = parseFloat(summaryRow.revenue);
    const transactions = parseInt(summaryRow.transactions);
    const profit = revenue - parseFloat(costRow.cost);

    // Per-calendar-month revenue/transactions.
    const monthlyRevRows = await query(
      `${scopedSalesCte}
       SELECT DATE_FORMAT(st.invoice_date, '%Y-%m') AS ym,
              COALESCE(SUM(st.total), 0) AS revenue,
              COUNT(*) AS transactions
       FROM scoped_sales st
       WHERE st.status = 'Paid' AND st.invoice_date >= ? AND st.invoice_date <= ?
       GROUP BY DATE_FORMAT(st.invoice_date, '%Y-%m')`,
      [...scopedSalesParams, startStr, endStr]
    ) as any[];

    // Per-calendar-month cost (profit = that month's revenue - cost).
    const monthlyCostRows = await query(
      `${scopedSalesCte}
       SELECT DATE_FORMAT(st.invoice_date, '%Y-%m') AS ym,
              COALESCE(SUM(si.quantity * COALESCE(si.cost_at_sale, p.cost, 0)), 0) AS cost
       FROM sale_items si
       JOIN scoped_sales st ON si.sale_id = st.id
       JOIN products p ON si.product_id = p.id
       WHERE st.status = 'Paid' AND st.invoice_date >= ? AND st.invoice_date <= ?
       GROUP BY DATE_FORMAT(st.invoice_date, '%Y-%m')`,
      [...scopedSalesParams, startStr, endStr]
    ) as any[];

    const revByYm = new Map<string, { revenue: number; transactions: number }>();
    for (const r of monthlyRevRows) revByYm.set(r.ym, { revenue: parseFloat(r.revenue), transactions: parseInt(r.transactions) });
    const costByYm = new Map<string, number>();
    for (const r of monthlyCostRows) costByYm.set(r.ym, parseFloat(r.cost));

    // Build 12 fiscal periods in order, each mapped to its actual calendar month.
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const months = [];
    for (let period = 0; period < 12; period++) {
      const d = new Date(fiscalYear, (startMonth - 1) + period, 1);
      const y = d.getFullYear();
      const m = d.getMonth(); // 0-11
      const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
      const rev = revByYm.get(ym) || { revenue: 0, transactions: 0 };
      months.push({
        period: period + 1,
        monthLabel: `${MONTHS[m]} ${y}`,
        revenue: rev.revenue,
        transactions: rev.transactions,
        profit: rev.revenue - (costByYm.get(ym) || 0),
      });
    }

    return NextResponse.json({
      success: true,
      fiscalYear,
      fiscalStartMonth: startMonth,
      label: formatFiscalYear(fiscalYear, startMonth),
      availableFiscalYears,
      summary: {
        revenue,
        transactions,
        profit,
        avgTransaction: transactions > 0 ? revenue / transactions : 0,
      },
      months,
    });
  } catch (error: any) {
    console.error('Error fetching fiscal year report:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch fiscal year report' }, { status: 500 });
  }
}
