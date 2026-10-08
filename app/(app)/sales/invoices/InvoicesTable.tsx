'use client';

import { Fragment } from 'react';
import { Table as TableInstance, flexRender } from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatQuantity } from '@/lib/utils';
import { formatAmount } from './use-invoices-utils';
import type { Sale } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  table: TableInstance<Sale>;
  loading: boolean;
  expandedRows: Set<string>;
  onToggleRow: (id: string) => void;
};

export function InvoicesTable({ table, loading, expandedRows, onToggleRow }: Props) {
  return (
    <Table className="text-xs border-separate border-spacing-0" wrapperClassName="h-[550px] border rounded-md relative">
      <TableHeader className="bg-primary">
        {table.getHeaderGroups().map(hg => (
          <TableRow key={hg.id} className="bg-primary hover:bg-primary">
            {hg.headers.map(header => (
              <TableHead
                key={header.id}
                className={cn(
                  'sticky top-0 z-20 text-primary-foreground font-semibold py-2 px-2 bg-primary border-b',
                  header.column.id === 'expand' && 'w-8',
                  ['total', 'amountPaid', 'balance'].includes(header.column.id) && 'text-right'
                )}
              >
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center">
              <div className="flex justify-center items-center">
                <Spinner className="h-6 w-6 mr-2 text-primary" />
                <span className="text-sm text-muted-foreground">Loading sales invoices...</span>
              </div>
            </TableCell>
          </TableRow>
        ) : table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center">
              No invoices found matching the filters.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row, index) => {
            const sale = row.original;
            const isExpanded = expandedRows.has(sale.id);
            return (
              <Fragment key={sale.id}>
                <TableRow
                  className={cn('cursor-pointer hover:bg-accent', index % 2 === 0 ? 'bg-background' : 'bg-muted/50')}
                  onClick={() => onToggleRow(sale.id)}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="py-2 px-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {isExpanded && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={table.getVisibleLeafColumns().length} className="py-3 px-4">
                      <div className="p-4 border rounded bg-background/50">
                        <h4 className="font-semibold mb-2 text-sm">Invoice Items ({sale.items.length})</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Product</TableHead>
                              <TableHead className="text-right text-xs">Quantity</TableHead>
                              <TableHead className="text-right text-xs">Price per Item</TableHead>
                              <TableHead className="text-right text-xs">Subtotal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(sale.items || []).map((item, idxx) => {
                              const batchSource: any[] = (item as any).batchSource || [];
                              const costAtSale: number | null = (item as any).costAtSale ?? null;
                              const hasBatchData = batchSource.length > 0;
                              const itemRevenue = Number(item.price || 0) * Number(item.quantity || 0);
                              const itemCost = costAtSale != null ? costAtSale * Number(item.quantity || 0) : null;
                              const itemProfit = itemCost != null ? itemRevenue - itemCost : null;
                              return (
                                <Fragment key={item.product?.id || (item as any).productId || idxx}>
                                  <TableRow>
                                    <TableCell className="py-1 text-xs">{item.product?.name || (item as any).productName || 'Unknown Product'}</TableCell>
                                    <TableCell className="text-right py-1 text-xs">{formatQuantity(item.quantity)}</TableCell>
                                    <TableCell className="text-right py-1 text-xs">₱{formatAmount(item.price)}</TableCell>
                                    <TableCell className="text-right py-1 text-xs">₱{formatAmount(itemRevenue)}</TableCell>
                                  </TableRow>
                                  {hasBatchData && (
                                    <TableRow className="bg-amber-50/50 hover:bg-amber-50/50">
                                      <TableCell colSpan={4} className="py-0 px-3 pb-2">
                                        <div className="mt-1 rounded border border-amber-200 overflow-hidden">
                                          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100/70 border-b border-amber-200">
                                            <span className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">Batch Cost Breakdown</span>
                                            {itemProfit != null && (
                                              <span className={`ml-auto text-[10px] font-medium ${itemProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                                Gross Profit: ₱{formatAmount(itemProfit)} ({itemRevenue > 0 ? ((itemProfit / itemRevenue) * 100).toFixed(1) : '0.0'}%)
                                              </span>
                                            )}
                                          </div>
                                          <table className="w-full text-[10px]">
                                            <thead>
                                              <tr className="bg-amber-50/80">
                                                {['Source Batch', 'Qty', 'Unit Cost', 'Sell Price', 'Line Cost', 'Line Revenue', 'Profit'].map(h => (
                                                  <th key={h} className={`${h === 'Source Batch' ? 'text-left' : 'text-right'} px-2 py-1 text-amber-700 font-medium`}>{h}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {batchSource.map((split: any, si: number) => {
                                                const splitRevenue = split.qty * Number(item.price || 0);
                                                const splitCost = split.qty * split.unitCost;
                                                const splitProfit = splitRevenue - splitCost;
                                                return (
                                                  <tr key={si} className={si % 2 === 0 ? 'bg-white' : 'bg-amber-50/30'}>
                                                    <td className="px-2 py-0.5">
                                                      {split.type === 'fallback'
                                                        ? <span className="italic text-muted-foreground">(untracked — fallback)</span>
                                                        : <span className="font-mono">{split.batchId}</span>}
                                                    </td>
                                                    <td className="text-right px-2 py-0.5">{split.qty}</td>
                                                    <td className="text-right px-2 py-0.5 text-blue-700">₱{formatAmount(split.unitCost)}</td>
                                                    <td className="text-right px-2 py-0.5">₱{formatAmount(Number(item.price || 0))}</td>
                                                    <td className="text-right px-2 py-0.5">₱{formatAmount(splitCost)}</td>
                                                    <td className="text-right px-2 py-0.5">₱{formatAmount(splitRevenue)}</td>
                                                    <td className={`text-right px-2 py-0.5 font-medium ${splitProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>₱{formatAmount(splitProfit)}</td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
