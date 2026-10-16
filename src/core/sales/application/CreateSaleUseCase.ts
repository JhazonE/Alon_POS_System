import { SaleRepository } from '../domain/ISaleRepository';
import { SaleEntity, SaleItemEntity } from '../domain/Sale';
import { InventorySyncService } from '../../../infrastructure/services/InventorySyncService';
import { query, getNextReference, getNextReceiptNumber } from '../../../../lib/mysql';
import { assertWarehouseInBranch, type BranchScope } from '../../../../lib/branch-context';
import { PoolConnection } from 'mysql2/promise';
import { deductFromBatches, getBatchCostingSettings } from '../../../../lib/batch-deduction';

export interface CreateSaleRequest {
  customer: { id: string; name: string };
  invoiceDate: string;
  dueDate?: string;
  reference?: string;
  paymentMethod: string;
  paymentReference?: string;
  status: any;
  notes?: string;
  items: any[];
  shipping?: number;
}

export class CreateSaleUseCase {
  constructor(
    private saleRepository: SaleRepository,
    private inventoryService: InventorySyncService
  ) {}

  /**
   * `scope` is the caller's resolved branch (see resolveScopeFromBody). It is
   * required, not optional, so a new caller cannot silently skip the check:
   * a single-branch scope may only sell products held in its own branch's
   * warehouses, and head office (`scope: 'all'`) may sell any.
   */
  async execute(request: CreateSaleRequest, scope: BranchScope): Promise<string> {
    // Before anything is generated or written: a refused sale must not consume
    // a reference or receipt number, or leave a gap in the sequence.
    await this.assertItemsInBranch(request.items, scope);

    const saleId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const total = request.items.reduce((acc: number, item: any) => {
      return acc + (item.price * item.quantity);
    }, 0) + (request.shipping || 0);

    // Generate reference if needed
    let finalReference = request.reference;
    if (!finalReference || finalReference.trim() === '') {
      const nextVal = await getNextReference('sales_invoice');
      finalReference = `INV-${nextVal.toString().padStart(6, '0')}`;
    }

    const receiptNumber = await getNextReceiptNumber();

    const saleEntity: SaleEntity = {
      id: saleId,
      customerId: request.customer.id,
      reference: finalReference,
      receiptNumber,
      invoiceDate: request.invoiceDate,
      dueDate: request.dueDate,
      total,
      paymentMethod: request.paymentMethod,
      paymentReference: request.paymentReference,
      status: request.status || 'Pending',
      transactionSource: 'Backoffice',
      notes: request.notes,
      items: request.items.map((item, index) => ({
        id: `${saleId}_item_${index + 1}`,
        saleId: saleId,
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.price
      }))
    };

    // Execute within repository transaction
    await this.saleRepository.saveWithTransaction(saleEntity, async (connection: PoolConnection) => {
      // Get batch costing settings
      const { oversellBlock } = await getBatchCostingSettings(connection);

      // 1. Check and deduct inventory for each item
      for (let i = 0; i < request.items.length; i++) {
        const item = request.items[i];
        const productId = item.product.id;
        const qty = item.quantity;
        const saleItemId = `${saleId}_item_${i + 1}`;

        await this.inventoryService.checkStockAvailability(productId, qty, connection);
        
        // --- BATCH COSTING: FIFO Deduction ---
        const deduction = await deductFromBatches(productId, qty, oversellBlock, connection);
        
        // Update the specific sale_item with cost info and batch splits
        await connection.query(
          `UPDATE sale_items 
           SET cost_at_sale = ?, batch_source = ? 
           WHERE id = ?`,
          [deduction.weightedAvgCost, JSON.stringify(deduction.splits), saleItemId]
        );
        // --- END BATCH COSTING ---

        await this.inventoryService.deductStockWithFamilySync(
          { productId: productId, quantity: qty },
          saleId,
          `Sales Invoice: ${finalReference} (Sync from Anchor: ${item.product.name})`,
          connection
        );
      }
    });

    // Handle External Sync (Fire and forget, logic from route.ts)
    this.triggerExternalSync(saleEntity, request.customer, request.items);

    return saleId;
  }

  /**
   * Refuse a sale that would deduct another branch's stock.
   *
   * sales_invoices carries no branch of its own, so the sale reaches its branch
   * through the stock it moves: each product's warehouse_id. A product with no
   * warehouse belongs to no branch, so there is no other branch to protect and
   * it is left alone; an unknown product id is left to checkStockAvailability's
   * own error.
   */
  private async assertItemsInBranch(items: any[], scope: BranchScope): Promise<void> {
    if (scope.scope === 'all') return;
    const productIds = Array.from(new Set(items.map((item) => item?.product?.id).filter(Boolean)));
    if (productIds.length === 0) return;
    const placeholders = productIds.map(() => '?').join(',');
    const rows = (await query(
      `SELECT DISTINCT warehouse_id FROM products WHERE id IN (${placeholders}) AND warehouse_id IS NOT NULL`,
      productIds
    )) as any[];
    for (const row of rows) {
      await assertWarehouseInBranch(row.warehouse_id, scope);
    }
  }

  private async triggerExternalSync(sale: SaleEntity, customer: any, items: any[]) {
    try {
      const { getExternalApiConfig } = await import('../../../../lib/external-api-config');
      const { syncSalesTransaction } = await import('../../../../lib/services/external-accounting-api');
      
      const apiConfig = await getExternalApiConfig();
      if (apiConfig.enabled) {
        const salesData = {
          id: sale.id,
          customer,
          invoiceDate: sale.invoiceDate,
          total: sale.total,
          paymentMethod: sale.paymentMethod,
          paymentReference: sale.paymentReference,
          status: sale.status,
          items,
        };
        
        syncSalesTransaction(sale.id, salesData, apiConfig).catch((err: any) => {
          console.error('Sales sync failed (non-blocking):', err);
        });
      }
    } catch (err) {
      console.error('Error triggering sales sync:', err);
    }
  }
}
