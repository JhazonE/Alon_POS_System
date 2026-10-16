import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, query } from '@/lib/mysql';
import { addFamilyStock, findUltimateRoot } from '@/lib/family-sync';
import { restoreBaseQty } from '@/lib/selling-unit-restore';
import { saveEJournalFiles } from '@/lib/ejournal/ejournal-writer';
import {
    resolveScopeFromBody,
    assertTerminalInBranch,
    branchErrorResponse,
} from '@/lib/branch-context';

// The void_reason column can't disappear once ensured — only pay the
// INFORMATION_SCHEMA round trip until the first success this process.
let voidReasonColumnEnsured = false;

async function ensureVoidReasonColumn() {
    if (voidReasonColumnEnsured) return;
    const cols = await query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_transactions' AND TABLE_SCHEMA = DATABASE()"
    ) as any[];
    if (!cols.some((c: any) => c.COLUMN_NAME === 'void_reason')) {
        await query("ALTER TABLE sales_transactions ADD COLUMN void_reason VARCHAR(255) DEFAULT NULL");
        console.log('✅ Added void_reason column to sales_transactions');
    }
    if (!cols.some((c: any) => c.COLUMN_NAME === 'voided_by_user_id')) {
        await query("ALTER TABLE sales_transactions ADD COLUMN voided_by_user_id VARCHAR(100) DEFAULT NULL");
        console.log('✅ Added voided_by_user_id column to sales_transactions');
    }
    if (!cols.some((c: any) => c.COLUMN_NAME === 'voided_by_name')) {
        await query("ALTER TABLE sales_transactions ADD COLUMN voided_by_name VARCHAR(255) DEFAULT NULL");
        console.log('✅ Added voided_by_name column to sales_transactions');
    }
    voidReasonColumnEnsured = true;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { saleId, voidReason, voidedByUserId, voidedByName } = body;
        console.log('void-transaction: Received saleId:', saleId);

        if (!saleId) {
            return NextResponse.json({ success: false, error: 'Sale ID is required' }, { status: 400 });
        }
        if (!voidReason || !String(voidReason).trim()) {
            return NextResponse.json({ success: false, error: 'A void reason is required' }, { status: 400 });
        }

        // Branch isolation. The void carries a user but no terminal or warehouse,
        // so the scope comes from the voiding user (an explicit `uid` wins, else
        // `voidedByUserId`, which the POS already sends). The sale is then
        // checked against that scope using its OWN stored branch_id: a valid
        // sale id in another branch is still refused — existence is not
        // authorisation. A sale with no stored branch (pre-migration-138 data)
        // falls back to the terminal that rang it; one with neither belongs to
        // no branch, so there is nothing to protect and it is left to proceed.
        // An unknown sale id is left to the transaction's own 404 below.
        try {
            const scope = await resolveScopeFromBody({
                ...body,
                uid: typeof body.uid === 'string' && body.uid ? body.uid : voidedByUserId,
            });
            if (scope.scope === 'single') {
                const saleRows = (await query(
                    'SELECT branch_id FROM sales_transactions WHERE id = ?',
                    [saleId]
                )) as any[];
                if (saleRows.length > 0) {
                    const saleBranchId = saleRows[0].branch_id;
                    if (saleBranchId) {
                        if (saleBranchId !== scope.branchId) {
                            return NextResponse.json(
                                { success: false, error: `Sale ${saleId} does not belong to branch ${scope.branchId}` },
                                { status: 403 }
                            );
                        }
                    } else {
                        const termRows = (await query(
                            'SELECT terminal_id FROM pos_transactions WHERE sale_id = ? LIMIT 1',
                            [saleId]
                        )) as any[];
                        const saleTerminalId = termRows[0]?.terminal_id;
                        if (saleTerminalId) await assertTerminalInBranch(saleTerminalId, scope);
                    }
                }
            }
        } catch (error) {
            const mapped = branchErrorResponse(error);
            if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
            throw error;
        }

        await ensureVoidReasonColumn();

        let notFound = false;
        let alreadyVoided = false;
        let periodLocked = false;

        const result = await withTransaction(async (connection: any) => {
            // 1. Fetch sales transaction to check status
            const [sale]: any = await connection.query('SELECT id, status, created_at FROM sales_transactions WHERE id = ?', [saleId]);
            console.log('void-transaction: Found sale:', sale);

            if (!sale || sale.length === 0) {
                notFound = true;
                return null;
            }

            if (String(sale[0].status || '').toLowerCase() === 'voided') {
                alreadyVoided = true;
                return null;
            }

            // 1b. BIR immutability: a transaction already swept into a Z-reading for its
            // terminal can no longer be voided — the Z-reading's totals are a locked
            // report, so silently voiding after the fact would make it disagree with
            // what was actually filed.
            const [termRow]: any = await connection.query(
                'SELECT terminal_id FROM pos_transactions WHERE sale_id = ? LIMIT 1', [saleId]
            );
            const terminalId = termRow?.[0]?.terminal_id;
            if (terminalId) {
                const [zRow]: any = await connection.query(
                    'SELECT report_date FROM z_readings WHERE terminal_id = ? AND report_date >= ? ORDER BY report_date DESC LIMIT 1',
                    [terminalId, sale[0].created_at]
                );
                if (zRow && zRow.length > 0) {
                    periodLocked = true;
                    return null;
                }
            }

            // 2. Fetch items to reverse stock
            const [items]: any = await connection.query('SELECT product_id, product_name, quantity, selling_unit_qty_base FROM sale_items WHERE sale_id = ?', [saleId]);
            console.log('void-transaction: Found items:', items?.length || 0);

            if (items && items.length > 0) {
                for (const item of items) {
                    // --- Inventory Addition (Reversal) using recursive family sync ---
                    // sale_items.quantity is UNITS SOLD; stock is in base units.
                    // Restoring the raw quantity would give back 1 base unit for
                    // a voided Case of 24.
                    const restoreQty = restoreBaseQty(item);
                    const { rootId, factorToRoot } = await findUltimateRoot(item.product_id, connection as any);
                    const quantityToAddInRootUnits = restoreQty / factorToRoot;
                    
                    await addFamilyStock(
                        rootId, 
                        quantityToAddInRootUnits, 
                        saleId, 
                        'adjustment', 
                        `Voiding POS Sale: ${saleId}`, 
                        connection as any
                    );
                }
            }

            // 3. Update sales_transactions status to 'voided'
            await connection.query(
                'UPDATE sales_transactions SET status = "Voided", void_reason = ?, voided_by_user_id = ?, voided_by_name = ?, updated_at = NOW() WHERE id = ?',
                [voidReason.trim(), voidedByUserId || null, voidedByName || null, saleId]
            );
            console.log('void-transaction: Transaction marked as voided');

            const [meta]: any = await connection.query(
              `SELECT DATE(st.created_at) AS d, pt.terminal_id AS t
               FROM sales_transactions st JOIN pos_transactions pt ON pt.sale_id = st.id
               WHERE st.id = ? LIMIT 1`, [saleId]
            );
            const d = meta?.[0]?.d ? String(meta[0].d) : null;
            const t = meta?.[0]?.t ?? 'all';

            return { d, t };
        });

        if (notFound) {
            return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
        }
        if (alreadyVoided) {
            return NextResponse.json({ success: false, error: 'Transaction is already voided' }, { status: 400 });
        }
        if (periodLocked) {
            return NextResponse.json({ success: false, error: 'This transaction was already included in a Z-Reading and can no longer be voided' }, { status: 409 });
        }

        if (result?.d) {
            saveEJournalFiles(result.d, result.t).catch((e) => console.error('e-journal auto-save failed:', e));
        }

        return NextResponse.json({
            success: true,
            message: 'POS sale voided and stock restored successfully'
        });
    } catch (error: any) {
        console.error('Error voiding POS sale:', error);
        return NextResponse.json(
            { success: false, error: `Failed to void POS sale: ${error.message}` },
            { status: 500 }
        );
    }
}

