'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { mockProducts } from '@/lib/data';
import type { SerialNumber } from '@/lib/types';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatQuantity } from '@/lib/utils';

import { mockSerialNumbers } from './mock-serials';
import { AddSerialNumberDialog } from './add-serial-number-dialog';
import { SerialNumberRow } from './serial-number-row';

export default function SerialNumbersPage() {
  const params = useParams();
  const productId = params.productId as string;

  const product = mockProducts.find(p => p.id === productId);
  const serialNumbers = mockSerialNumbers.filter((s: SerialNumber) => s.productId === productId);

  const inStockCount = serialNumbers.filter((s: SerialNumber) => s.status === 'In Stock').length || 0;
  const stockMismatch = product && product.stock !== inStockCount;

  if (!product) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p>The product you are looking for does not exist.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <Link href="/inventory">
                        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 w-10 p-0">
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    </Link>
                    <CardTitle>Manage Serials for {product.name}</CardTitle>
                </div>
                <CardDescription>
                Add, view, and manage unique serial numbers for this product.
                Current Stock: <Badge variant="outline">{formatQuantity(product.stock)}</Badge>.
                In-Stock Serials: <Badge variant="outline">{formatQuantity(inStockCount)}</Badge>.
                </CardDescription>
            </div>
            <AddSerialNumberDialog product={product} />
        </div>
      </CardHeader>
      <CardContent>
        {stockMismatch && (
            <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Stock Count Mismatch!</AlertTitle>
                <AlertDescription>
                    The total stock quantity ({formatQuantity(product.stock)}) does not match the number of "In Stock" serial numbers ({formatQuantity(inStockCount)}). Please review your serials or perform a stock adjustment.
                </AlertDescription>
            </Alert>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date Added</TableHead>
              <TableHead><span className='sr-only'>Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serialNumbers && serialNumbers.length > 0 ? (
              serialNumbers.map((serial) => (
                <SerialNumberRow key={serial.id} serial={serial} productId={product.id} />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No serial numbers have been added for this product yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <div className="text-xs text-muted-foreground">
          A total of {serialNumbers?.length || 0} serial numbers recorded for this product.
        </div>
      </CardFooter>
    </Card>
  );
}
