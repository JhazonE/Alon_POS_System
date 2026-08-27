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
import { Product } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { EditProductDialog } from '../../products/edit-product/edit-product-dialog';
import { formatQuantity } from '@/lib/utils';


function DetailItem({ label, value }: { label: string, value: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
        </div>
    )
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.productId as string;

  const product = mockProducts.find(p => p.id === productId);
  const units = product ? mockProducts.filter(p => p.parentId === product.parentId) : [];
  const isLoading = false;

  if (isLoading) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
                <Skeleton className="h-9 w-9" />
                <Skeleton className="h-8 w-48" />
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-5 w-80 mt-2" />
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-8">
                     <Skeleton className="w-full h-96 rounded-lg" />
                     <div className="flex flex-col gap-6">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                         <Skeleton className="h-16 w-full" />
                     </div>
                </CardContent>
            </Card>
        </div>
    );
  }

  if (!product) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p>The product you are looking for does not exist.</p>
           <button onClick={() => router.back()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
            <Link href="/products">
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 w-10 p-0">
                    <ArrowLeft className="h-4 w-4" />
                </button>
            </Link>
            <h1 className="text-2xl font-bold">{product.name}</h1>
        </div>
        <Card>
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>{product.name}</CardTitle>
                    <CardDescription>
                        {product.description}
                    </CardDescription>
                </div>
                 <EditProductDialog product={product} />
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-8">
                <Image
                    src={product.imageUrl || "https://picsum.photos/seed/default-product/400/300"}
                    alt={product.name}
                    width={600}
                    height={600}
                    className="rounded-lg object-cover w-full aspect-square"
                />
                <div className="space-y-6 md:col-span-2">
                    <div className="grid grid-cols-2 gap-6">
                        <DetailItem label="Brand" value={product.brand} />
                        <DetailItem label="Category" value={product.category} />
                         {product.subcategory && <DetailItem label="Subcategory" value={product.subcategory} />}
                         <DetailItem label="Base SKU" value={<Badge variant="outline">{product.sku}</Badge>} />
                    </div>
                     <Separator />
                     <div className="grid grid-cols-3 gap-6">
                         <DetailItem label="Total Stock" value={`${formatQuantity(product.stock)} ${product.unitOfMeasure}(s)`} />
                         <DetailItem label="Reorder Point" value={'N/A'} />
                          
                     </div>
                     <Separator />
                     <div>
                        <h3 className="text-lg font-semibold mb-2">Selling Units</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Unit Name</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Conversion</TableHead>
                                    <TableHead>SKU</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {units && units.length > 0 ? units.map((unit: Product) => (
                                    <TableRow key={unit.id}>
                                        <TableCell className='font-medium'>{unit.name}</TableCell>
                                        <TableCell>₱{unit.price.toFixed(2)}</TableCell>
                                        <TableCell>1 {unit.name} = {unit.conversionFactor} {product.unitOfMeasure}(s)</TableCell>
                                        <TableCell><Badge variant="secondary">{unit.sku}</Badge></TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center h-24">No child selling units defined.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                     </div>
                </div>
            </CardContent>
             <CardFooter>
                <p className="text-xs text-muted-foreground">Product ID: {product.id}</p>
             </CardFooter>
        </Card>

    </div>
  );
}
