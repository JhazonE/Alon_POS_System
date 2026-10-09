'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Filter, 
  Calendar, 
  ArrowUpDown, 
  Eye, 
  FileText,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ApprovalItem {
  id: string;
  transaction_type: string;
  transaction_data: any;
  status: 'Pending' | 'Approved' | 'Rejected';
  current_step: number;
  created_by: string;
  requester_name: string;
  requester_email: string;
  created_at: string;
  updated_at: string;
  currentStepRole: string;
  currentStepRoleId: string | null;
  history: any[];
  workflow: any[];
}

interface ApprovalsHistoryDialogProps {
  items: ApprovalItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetails: (item: ApprovalItem) => void;
}

export function ApprovalsHistoryDialog({ 
  items, 
  open, 
  onOpenChange,
  onViewDetails
}: ApprovalsHistoryDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Approved' | 'Rejected' | 'Pending'>('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = 
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.requester_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.transaction_data.productName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesType = typeFilter === 'ALL' || item.transaction_type === typeFilter;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [items, searchTerm, statusFilter, typeFilter]);

  const transactionTypes = useMemo(() => {
    const types = new Set(items.map(i => i.transaction_type));
    return Array.from(types).sort();
  }, [items]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100"><CheckCircle2 className="w-3 h-3 mr-1" /> Finalized</Badge>;
      case 'Rejected':
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case 'Pending':
        return <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200"><Clock className="w-3 h-3 mr-1" /> In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
        case 'STOCK_ADJUSTMENT': return 'bg-amber-50 text-amber-700 border-amber-100';
        case 'STOCK_TRANSFER': return 'bg-blue-50 text-blue-700 border-blue-100';
        case 'PURCHASE_ORDER': return 'bg-purple-50 text-purple-700 border-purple-100';
        case 'RECEIVE_PO': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        case 'BAD_ORDER': return 'bg-red-50 text-red-700 border-red-100';
        case 'STOCK_COUNT': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
        case 'PRODUCT_CREATE': return 'bg-green-50 text-green-700 border-green-100';
        default: return 'bg-secondary/50 text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 bg-background/95 backdrop-blur-xl">
        <DialogHeader className="p-6 pb-0">
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                Approval History Logs
              </DialogTitle>
              <DialogDescription>
                Full audit trail of all transaction authorization requests.
              </DialogDescription>
            </div>
            <div className="bg-primary/5 px-4 py-2 rounded-xl border border-primary/10">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block">Total Records</span>
                <span className="text-xl font-bold">{filteredItems.length}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 mt-6 pb-4 border-b">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, product, or requester..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2">
              <select 
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="ALL">All Statuses</option>
                <option value="Approved">Finalized</option>
                <option value="Rejected">Rejected</option>
                <option value="Pending">In Progress</option>
              </select>

              <select 
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Types</option>
                {transactionTypes.map(type => (
                  <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                ))}
              </select>

              <button onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
                setTypeFilter('ALL');
              }} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                Reset
              </button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="w-[120px] font-bold">Date</TableHead>
                <TableHead className="w-[100px] font-bold">Ref ID</TableHead>
                <TableHead className="font-bold">Transaction Type</TableHead>
                <TableHead className="font-bold">Primary Item</TableHead>
                <TableHead className="font-bold">Requester</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="text-right font-bold w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 opacity-20" />
                      <p>No records found matching your filters.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow key={item.id} className="group cursor-pointer hover:bg-secondary/20" onClick={() => onViewDetails(item)}>
                    <TableCell className="text-xs font-medium">
                      {format(new Date(item.created_at), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] font-bold">
                        {item.id.substring(3, 11)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[9px] font-bold tracking-tight px-1.5 h-5", getTypeStyle(item.transaction_type))}>
                        {item.transaction_type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold truncate">
                          {item.transaction_data.productName || item.transaction_data.name || 'Multiple Items'}
                        </span>
                        {(item.transaction_data.productBarcode || item.transaction_data.barcode) && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            BC: {item.transaction_data.productBarcode || item.transaction_data.barcode}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">
                          {item.requester_name.charAt(0)}
                        </div>
                        <span className="text-xs font-semibold">{item.requester_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(item.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="h-4 w-4 text-primary" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        
        <div className="p-4 border-t bg-secondary/5 flex justify-between items-center text-xs text-muted-foreground">
            <div>Showing {filteredItems.length} of {items.length} total requests</div>
            <div className="italic">Click any row to view full transaction authorization details.</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
