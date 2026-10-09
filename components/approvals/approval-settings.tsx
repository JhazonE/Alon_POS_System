'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings2, Plus, Trash2, Save, Info, ChevronLeft } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

interface WorkflowStep {
  id?: string;
  user_type_id: string;
  role_name?: string;
}

const TRANSACTION_TYPES = [
  { value: 'STOCK_ADJUSTMENT', label: 'Stock Adjustment' },
  { value: 'STOCK_TRANSFER', label: 'Stock Transfer' },
  { value: 'PURCHASE_ORDER', label: 'Purchase Order' },
  { value: 'RECEIVE_PO', label: 'Receive Purchase Order' },
  { value: 'BAD_ORDER', label: 'Bad Order (Damages/Returns)' },
  { value: 'STOCK_COUNT', label: 'Inventory Count' },
  { value: 'SHELF_TRANSFER', label: 'Shelf Transfer' },
  { value: 'PRODUCT_CREATE', label: 'Add Product' },
];

interface ApprovalSettingsProps {
  onBack?: () => void;
}

export function ApprovalSettings({ onBack }: ApprovalSettingsProps) {
  const { toast } = useToast();
  const [selectedTxType, setSelectedTxType] = useState('STOCK_ADJUSTMENT');
  const [workflows, setWorkflows] = useState<Record<string, WorkflowStep[]>>({});
  const [roles, setRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [wfRes, rolesRes] = await Promise.all([
          fetch('/api/approvals/workflows'),
          fetch('/api/user-types')
        ]);
        
        const wfData = await wfRes.json();
        const rolesData = await rolesRes.json();

        if (wfData.success) {
          setWorkflows(wfData.data);
        }
        setRoles(rolesData || []);
      } catch (error) {
        console.error('Failed to fetch approval settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const currentSteps = workflows[selectedTxType] || [];

  const addStep = () => {
    const newSteps = [...currentSteps, { user_type_id: roles[0]?.id || '' }];
    setWorkflows({ ...workflows, [selectedTxType]: newSteps });
  };

  const removeStep = (index: number) => {
    const newSteps = currentSteps.filter((_, i) => i !== index);
    setWorkflows({ ...workflows, [selectedTxType]: newSteps });
  };

  const updateStep = (index: number, roleId: string) => {
    const newSteps = [...currentSteps];
    newSteps[index] = { ...newSteps[index], user_type_id: roleId };
    setWorkflows({ ...workflows, [selectedTxType]: newSteps });
  };

  const saveWorkflow = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/approvals/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionType: selectedTxType,
          steps: currentSteps
        })
      });
      const result = await response.json();
      if (result.success) {
        toast({ title: 'Success', description: result.message });
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save workflow', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Back to Approvals"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Approval Settings</h1>
                <p className="text-sm text-muted-foreground">Customize approval stages and roles for each transaction type.</p>
            </div>
        </div>
        <button onClick={saveWorkflow} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? 'Saving...' : <><Save className="mr-2 h-4 w-4" /> Save Configuration</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Sidebar: Transaction Types */}
        <div className="md:col-span-1 space-y-1 overflow-y-auto pr-2">
          {TRANSACTION_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setSelectedTxType(type.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedTxType === type.value 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : 'hover:bg-secondary/50 text-muted-foreground'
              }`}
            >
              {type.label}
              {workflows[type.value]?.length > 0 && (
                <Badge variant="outline" className={`ml-2 float-right ${selectedTxType === type.value ? 'bg-primary-foreground/20 text-white' : ''}`}>
                  {workflows[type.value].length}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* Main Content: Workflow Editor */}
        <div className="md:col-span-3 min-h-0 overflow-y-auto">
          <Card className="h-full shadow-sm border-border/50 flex flex-col">
            <CardHeader className="border-b bg-secondary/5 py-3 px-4">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-sm">Workflow: {TRANSACTION_TYPES.find(t => t.value === selectedTxType)?.label}</CardTitle>
                  <CardDescription className="text-[11px]">Define the sequence of roles required.</CardDescription>
                </div>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-7 text-[10px]" onClick={addStep}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Step
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex-1">
              {currentSteps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-xl border-muted-foreground/10 bg-muted/5">
                  <Settings2 className="h-8 w-8 text-muted-foreground/20 mb-3" />
                  <p className="text-xs font-medium text-muted-foreground">No approval steps defined.</p>
                  <p className="text-[10px] text-muted-foreground/60 mb-3">Transactions will be finalized immediately.</p>
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-7 text-[10px]" onClick={addStep}>
                    Define First Step
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentSteps.map((step, index) => (
                    <div 
                      key={index} 
                      className="group flex items-center gap-3 p-3 rounded-lg bg-background border border-border shadow-sm transition-all hover:border-primary/20"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge variant="secondary" className="rounded-full h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                          {index + 1}
                        </Badge>
                        <Separator orientation="vertical" className="h-6 bg-border group-last:hidden" />
                      </div>
                      
                      <div className="flex-1 space-y-0.5">
                        <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">Approval Role</p>
                        <Select
                          value={step.user_type_id}
                          onValueChange={(val) => updateStep(index, val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map(role => (
                              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <button 
                        className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                        onClick={() => removeStep(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  
                  <div className="flex items-start gap-2 p-3 text-[10px] text-muted-foreground bg-blue-50/30 rounded-lg border border-blue-100">
                    <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <p>Approvals are sequential. A transaction must be approved by step 1 before proceeding to step 2.</p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t bg-secondary/5 px-4 py-2.5">
                 <p className="text-[10px] text-muted-foreground">
                    Changes will affect all new transactions. Pending transactions follow their original workflow.
                 </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
