import { query, withTransaction } from '../../../lib/mysql';
import { SaleRepository, GetSalesFilters } from '../../core/sales/domain/ISaleRepository';
import { SaleEntity, SaleItemEntity } from '../../core/sales/domain/Sale';
import { PoolConnection } from 'mysql2/promise';

export class MySqlSaleRepository implements SaleRepository {
  async findAll(filters: GetSalesFilters): Promise<SaleEntity[]> {
    const invoicesQuery = `
      SELECT
        si.id,
        si.customer_id as customerId,
        si.reference,
        si.receipt_number as receiptNumber,
        si.invoice_date as invoiceDate,
        si.due_date as dueDate,
        si.total,
        si.payment_method as paymentMethod,
        si.payment_reference as paymentReference,
        si.status,
        si.transaction_source as transactionSource,
        si.notes,
        si.created_at as createdAt,
        si.updated_at as updatedAt,
        (
          SELECT pt.order_number 
          FROM sales_transactions st
          JOIN pos_transactions pt ON st.id = pt.sale_id
          WHERE st.reference = si.reference AND si.reference IS NOT NULL AND si.reference != ''
          LIMIT 1
        ) as orderNumber
      FROM sales_invoices si
      ORDER BY si.created_at DESC
    `;

    const salesInvoices: any[] = await query(invoicesQuery);
    
    // Deduplicate and process items in batch
    if (salesInvoices.length === 0) return [];

    const invoiceIds = salesInvoices.map((inv: any) => inv.id);
    const placeholders = invoiceIds.map(() => '?').join(',');
    const itemsQuery = `
      SELECT
        sii.id,
        sii.sales_invoice_id as salesId,
        sii.product_id as productId,
        sii.product_name as productName,
        p.sku,
        p.barcode,
        sii.quantity,
        sii.price,
        si.cost_at_sale as costAtSale,
        si.batch_source as batchSource
      FROM sales_invoice_items sii
      LEFT JOIN products p ON sii.product_id = p.id
      LEFT JOIN sales_invoices inv ON sii.sales_invoice_id = inv.id
      LEFT JOIN sales_transactions st ON inv.reference = st.reference AND inv.reference IS NOT NULL AND inv.reference != ''
      LEFT JOIN sale_items si ON st.id = si.sale_id AND si.product_id = sii.product_id
      WHERE sii.sales_invoice_id IN (${placeholders})
      ORDER BY sii.created_at ASC
    `;
    const allItems = await query(itemsQuery, invoiceIds);

    // Group items by sales ID
    const itemsBySale: Record<string, SaleItemEntity[]> = {};
    allItems.forEach((item: any) => {
      if (!itemsBySale[item.salesId]) {
        itemsBySale[item.salesId] = [];
      }

      // Parse batchSource JSON safely
      let batchSource: any = null;
      try {
        batchSource = item.batchSource
          ? (typeof item.batchSource === 'string' ? JSON.parse(item.batchSource) : item.batchSource)
          : null;
      } catch { batchSource = null; }

      itemsBySale[item.salesId].push({
        id: item.id,
        saleId: item.salesId,
        productId: item.productId,
        productName: item.productName,
        quantity: parseFloat(item.quantity),
        price: parseFloat(item.price),
        sku: item.sku,
        barcode: item.barcode,
        costAtSale: item.costAtSale != null ? parseFloat(item.costAtSale) : null,
        batchSource,
      } as any);
    });


    return salesInvoices.map((row: any) => ({
      ...row,
      items: itemsBySale[row.id] || []
    }));
  }

  async findById(id: string): Promise<SaleEntity | null> {
    // Basic implementation for finding specific sale
    const sales = await this.findAll({});
    return sales.find(s => s.id === id) || null;
  }

  async create(sale: SaleEntity): Promise<string> {
    // This would normally be handled by saveWithTransaction
    throw new Error('Use saveWithTransaction for complete Sale creation');
  }

  async saveWithTransaction(sale: SaleEntity, inventoryOperations: (connection: PoolConnection) => Promise<void>): Promise<string> {
    return await withTransaction(async (connection) => {
      // 1. Insert into sales_invoices
      const insertInvoiceSql = `
        INSERT INTO sales_invoices (
          id, customer_id, reference, receipt_number, invoice_date, due_date, total, payment_method,
          payment_reference, status, transaction_source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      await connection.query(insertInvoiceSql, [
        sale.id,
        sale.customerId,
        sale.reference,
        sale.receiptNumber,
        sale.invoiceDate,
        sale.dueDate || null,
        sale.total,
        sale.paymentMethod,
        sale.paymentReference || null,
        sale.status,
        sale.transactionSource,
        sale.notes || null
      ]);

      // 2. Insert items
      //
      // `quantity` here is in BASE units: this back-office path has no
      // selling-unit UI, so the `selling_unit_*` snapshot columns are left NULL
      // and the invoice void restores this quantity as-is (NULL means a
      // multiplier of 1 — see lib/selling-unit-restore.ts). If this path ever
      // learns to accept selling units, it MUST also write
      // selling_unit_id/_name/_qty_base, or the void will under-restore stock
      // exactly the way the POS void did before the 2026-10-07 fix.
      const insertItemSql = `
        INSERT INTO sales_invoice_items (
          id, sales_invoice_id, product_id, product_name, quantity, price, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      for (let i = 0; i < sale.items.length; i++) {
        const item = sale.items[i];
        await connection.query(insertItemSql, [
          item.id,
          sale.id,
          item.productId,
          item.productName,
          item.quantity,
          item.price
        ]);
      }

      // 3. Perform inventory operations passed from use case
      await inventoryOperations(connection);

      return sale.id;
    });
  }
}
