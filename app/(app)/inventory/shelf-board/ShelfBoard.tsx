'use client';

import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Box, Rows3, RefreshCw, PackageOpen, ArrowRight, Trash2, AlertCircle, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { Product, ShelfLocation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getApiUrl } from '@/lib/api-config';
import { cn, formatStockQuantity } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ManageShelfLocationsDialog } from '../../products/shelf-locations/ManageShelfLocationsDialog';
import { updateProductShelfLocations } from '../../products/actions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { v4 as uuidv4 } from 'uuid';
import { Spinner } from '@/components/ui/spinner';


interface StockItem {
  uniqueId: string;
  product: Product;
  shelfId: string;
  shelfName: string;
  quantity: number;
}

interface StagedItem {
  stagedId: string;
  sourceUniqueId: string;
  product: Product;
  sourceShelfId: string;
  sourceShelfName: string;
  maxQuantity: number;
  transferQuantity: number;
}

export default function ShelfBoard() {
  const { toast } = useToast();
  const [shelfLocations, setShelfLocations] = useState<ShelfLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  
  const [sourceSearch, setSourceSearch] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [targetShelfId, setTargetShelfId] = useState<string>('');
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [user, setUser] = useState<{ uid: string; [key: string]: any } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('source');

  useEffect(() => {
    setMounted(true);
    fetchData();
    const userSession = localStorage.getItem('mock-user-session');
    if (userSession) setUser(JSON.parse(userSession));
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [shelfRes, prodRes] = await Promise.all([
        fetch(getApiUrl('/shelf-locations')),
        fetch(getApiUrl('/products?limit=1000')),
      ]);
      const shelfData = await shelfRes.json();
      const prodData = await prodRes.json();
      if (shelfData.success) setShelfLocations(shelfData.data);
      if (prodData.success) setProducts(prodData.data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load data.' });
    } finally {
      setIsLoading(false);
    }
  };

  const allStockItems = useMemo<StockItem[]>(() => {
    return products.flatMap(p => {
      const items: StockItem[] = [];
      const stock = p.stock || 0;
      const assigned = Object.values(p.shelfQuantities || {}).reduce((a, b) => a + b, 0);
      const unassigned = stock - assigned;
      
      if (unassigned > 0 || (stock <= 0 && Object.keys(p.shelfQuantities || {}).length === 0)) {
        items.push({ uniqueId: `unassigned|${p.id}`, product: p, shelfId: 'unassigned', shelfName: 'Unassigned', quantity: unassigned > 0 ? unassigned : 0 });
      }
      if (p.shelfQuantities) {
        Object.entries(p.shelfQuantities).forEach(([sId, qty]) => {
          if (qty > 0) {
            const sn = shelfLocations.find(s => s.id === sId)?.name || 'Unknown Shelf';
            items.push({ uniqueId: `${sId}|${p.id}`, product: p, shelfId: sId, shelfName: sn, quantity: qty });
          }
        });
      }
      return items;
    });
  }, [products, shelfLocations]);

  const filteredSourceItems = useMemo(() => {
    return allStockItems.filter(i => {
      const term = sourceSearch.toLowerCase();
      return (i.product.name?.toLowerCase().includes(term) || i.product.sku?.toLowerCase().includes(term)) && i.quantity > 0;
    }).sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [allStockItems, sourceSearch]);

  const stageItems = (ids: Set<string> | string) => {
    const list = typeof ids === 'string' ? [ids] : Array.from(ids);
    const newStaged = [...stagedItems];
    list.forEach(id => {
      const item = allStockItems.find(i => i.uniqueId === id);
      if (!item || newStaged.some(s => s.sourceUniqueId === item.uniqueId)) return;
      newStaged.push({ stagedId: uuidv4(), sourceUniqueId: item.uniqueId, product: item.product, sourceShelfId: item.shelfId, sourceShelfName: item.shelfName, maxQuantity: Math.ceil(item.quantity), transferQuantity: Math.ceil(item.quantity) });
    });
    setStagedItems(newStaged);
    if (typeof ids !== 'string') setSelectedSourceIds(new Set());
    setActiveTab('staging');
  };

  const executeTransfer = async () => {
    if (!targetShelfId || stagedItems.length === 0) return;
    setIsTransferring(true);
    try {
      const result = await updateProductShelfLocations(stagedItems.map(i => ({ productId: i.product.id, sourceShelfId: i.sourceShelfId === 'unassigned' ? null : i.sourceShelfId, targetShelfId: targetShelfId === 'unassigned' ? null : targetShelfId, quantity: i.transferQuantity })), user?.uid || 'system');
      if (result.success) {
        toast({ title: "Success", description: "Transfer complete." });
        setTargetShelfId('');
        setActiveTab('source');
        setStagedItems([]);
        fetchData();
      } else throw new Error();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: "Transfer failed." });
    } finally {
      setIsTransferring(false);
    }
  };

  if (isLoading) return <div className="p-10 text-center"><Spinner className="h-6 w-6 mx-auto" /></div>;

  const SourcePane = (
      <div className="flex flex-col h-full w-full bg-background min-h-0">
          <div className="p-3 border-b space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-sm flex items-center gap-1.5 truncate"><Box className="h-4 w-4" /> Inventory</h2>
                  <div className="flex gap-1">
                      <button className="inline-flex items-center justify-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[13px] rounded-lg gap-1.5 h-7 text-[11px] font-bold" onClick={() => stageItems(selectedSourceIds)} disabled={selectedSourceIds.size === 0}>Stage All</button>
                      <ManageShelfLocationsDialog onLocationAdded={fetchData} trigger={<button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-7 px-1.5"><Rows3 className="h-4 w-4" /></button>} />
                  </div>
              </div>
              <Input placeholder="Search..." value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-[36px,1fr,56px] px-3 py-1 bg-muted/30 border-b text-[10px] font-bold text-muted-foreground uppercase">
              <div className="flex justify-center"><Checkbox checked={filteredSourceItems.length > 0 && selectedSourceIds.size === filteredSourceItems.length} onCheckedChange={() => setSelectedSourceIds(selectedSourceIds.size === filteredSourceItems.length ? new Set() : new Set(filteredSourceItems.map(i => i.uniqueId)))} /></div>
              <span>Product</span>
              <span className="text-right">Qty</span>
          </div>
          <ScrollArea className="flex-1">
              <div className="p-1.5 space-y-1">
                  {filteredSourceItems.map(item => (
                      <div key={item.uniqueId} className={cn("grid grid-cols-[36px,1fr,60px] items-center gap-2 p-2 rounded-lg border", selectedSourceIds.has(item.uniqueId) ? "bg-primary/5 border-primary" : "bg-card")}>
                          <div className="flex justify-center"><Checkbox checked={selectedSourceIds.has(item.uniqueId)} onCheckedChange={() => { const s = new Set(selectedSourceIds); if (s.has(item.uniqueId)) s.delete(item.uniqueId); else s.add(item.uniqueId); setSelectedSourceIds(s); }} /></div>
                          <div className="min-w-0" onClick={() => stageItems(item.uniqueId)}>
                              <p className="text-xs font-bold truncate leading-tight">{item.product.name}</p>
                              <div className="flex items-center gap-1.5 opacity-70"><Badge variant="outline" className="text-[9px] px-1 h-3.5 truncate max-w-[60px]">{item.shelfName}</Badge><span className="text-[9px] truncate font-mono">{item.product.sku}</span></div>
                          </div>
                          <div className="flex justify-end"><button className="inline-flex items-center justify-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring rounded-lg gap-1.5 h-8 px-1.5 text-xs font-bold" onClick={() => stageItems(item.uniqueId)}>{formatStockQuantity(item.quantity)}</button></div>
                      </div>
                  ))}
              </div>
          </ScrollArea>
      </div>
  );

  const TargetPane = (
      <div className="flex flex-col h-full w-full bg-background min-h-0 relative">
          <div className="p-3 border-b space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm flex items-center gap-1.5 text-primary"><ArrowRightLeft className="h-4 w-4" /> Destination</h2>
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-7 text-[10px] text-destructive" onClick={() => setStagedItems([])}>Clear</button>
              </div>
              <Select value={targetShelfId} onValueChange={setTargetShelfId}>
                  <SelectTrigger className="h-9 text-xs font-bold"><SelectValue placeholder="Target Shelf..." /></SelectTrigger>
                  <SelectContent><SelectItem value="unassigned" className="text-orange-600 font-bold">Unassigned</SelectItem>{shelfLocations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
          </div>
          <div className="flex justify-between px-3 py-1 bg-muted/30 border-b text-[10px] font-bold text-muted-foreground uppercase"><span>Staged ({stagedItems.length})</span><span>Qty</span></div>
          <ScrollArea className="flex-1">
              <div className="p-1.5 space-y-1 pb-4">
                  {stagedItems.map(item => (
                      <div key={item.stagedId} className="flex items-center justify-between gap-2 p-2 border rounded-lg bg-card" id={`staged-${item.stagedId}`}>
                          <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold truncate leading-tight">{item.product.name}</p>
                              <p className="text-[9px] opacity-60 truncate">From: {item.sourceShelfName} | Max: {formatStockQuantity(item.maxQuantity)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                              <Input type="number" step="1" value={item.transferQuantity} onChange={e => { const v = parseInt(e.target.value) || 1; setStagedItems(prev => prev.map(i => i.stagedId === item.stagedId ? { ...i, transferQuantity: Math.min(i.maxQuantity, Math.max(1, v)) } : i)); }} className="h-7 w-12 text-center text-xs p-1" />
                              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-7 w-7 text-muted-foreground" onClick={() => setStagedItems(prev => prev.filter(i => i.stagedId !== item.stagedId))}><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                      </div>
                  ))}
                  {stagedItems.length === 0 && <div className="py-10 text-center text-xs opacity-40">Staging empty</div>}
              </div>
          </ScrollArea>
          <div className="p-3 border-t bg-background/80 backdrop-blur shrink-0">
               <button 
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] w-full h-11 font-black shadow-lg shadow-primary/20" 
                disabled={!targetShelfId || stagedItems.length === 0 || isTransferring} 
                onClick={executeTransfer}
               >
                 {isTransferring ? <Spinner className="h-4 w-4 mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                 Confirm Transfer
               </button>
          </div>
      </div>
  );

  return (
      <div className="flex flex-col h-full w-full overflow-hidden">
          <div className="hidden lg:grid grid-cols-2 gap-4 h-full p-4">
              <div className="border rounded-2xl overflow-hidden shadow-sm">{SourcePane}</div>
              <div className="border rounded-2xl overflow-hidden shadow-sm">{TargetPane}</div>
          </div>
          <div className="flex lg:hidden flex-col h-full w-full overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                  <div className="px-3 pt-2 shrink-0"><TabsList className="grid grid-cols-2 w-full h-10 p-1 bg-muted/50 rounded-lg"><TabsTrigger value="source" className="text-xs font-bold">Source {stagedItems.length > 0 && `(${stagedItems.length})`}</TabsTrigger><TabsTrigger value="staging" className="text-xs font-bold">Staging</TabsTrigger></TabsList></div>
                  <TabsContent value="source" className="flex-1 m-0 min-h-0 data-[state=active]:flex flex-col">{SourcePane}</TabsContent>
                  <TabsContent value="staging" className="flex-1 m-0 min-h-0 data-[state=active]:flex flex-col relative">
                      {TargetPane}
                  </TabsContent>
              </Tabs>
          </div>
      </div>
  );
}
