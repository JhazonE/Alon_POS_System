'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import { Separator } from '@/components/ui/separator';

const terminalSchema = z.object({
  ipAddress: z.string().optional(),
  terminalDescription: z.string().min(1, "Terminal name is required"),
  inventoryLocation: z.string().optional(),
  zCounter: z.coerce.number().min(0, "Must be positive").default(0),
  resetCounter: z.coerce.number().min(0, "Must be positive").default(0),
});

type TerminalFormValues = z.infer<typeof terminalSchema>;

interface Terminal {
  id: string;
  terminalDescription: string;
  ipAddress: string | null;
  isActive: boolean;
  zCounter?: number;
  resetCounter?: number;
}

interface TerminalSettingsDialogProps {
  onTerminalChanged: (terminalId: string | null) => void;
  currentTerminalId: string | null;
}

export function TerminalSettingsDialog({ onTerminalChanged, currentTerminalId }: TerminalSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTerminals, setIsLoadingTerminals] = useState(false);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();

  const form = useForm<TerminalFormValues>({
    resolver: zodResolver(terminalSchema),
    defaultValues: {
      ipAddress: '',
      terminalDescription: '',
      inventoryLocation: 'Store',
      zCounter: 0,
      resetCounter: 0,
    },
  });

  useEffect(() => {
    if (open) {
      fetchTerminals();
      fetchWarehouses();
    }
  }, [open]);

  const fetchWarehouses = async () => {
    try {
      const response = await fetch(getApiUrl('/warehouses?activeOnly=true'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setWarehouses(result.data);
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchTerminals = async () => {
    try {
      setIsLoadingTerminals(true);
      const response = await fetch(getApiUrl('/pos-terminals?activeOnly=true'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setTerminals(result.data);
      }
    } catch (error) {
      console.error('Error fetching terminals:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load terminals'
      });
    } finally {
      setIsLoadingTerminals(false);
    }
  };

  const handeSelectTerminal = (terminalId: string) => {
    localStorage.setItem('pos_terminal_id', terminalId);
    onTerminalChanged(terminalId);
    toast({
      title: 'Terminal Selected',
      description: 'This browser is now configured for the selected terminal.',
    });
    setOpen(false);
  };

  const handleClearTerminal = () => {
    localStorage.removeItem('pos_terminal_id');
    onTerminalChanged(null);
    toast({
      title: 'Terminal Cleared',
      description: 'This browser is no longer linked to a specific terminal.',
    });
    setOpen(false);
  };

  async function onSubmit(values: TerminalFormValues) {
    setIsSaving(true);
    try {
      const response = await fetch(getApiUrl('/pos-terminals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           ...values,
           isActive: true
        }),
      });

      const result = await response.json();

      if (result.success && result.data?.id) {
        toast({
          title: 'Terminal Created',
          description: `New terminal has been created and selected.`,
        });
        
        // Auto-select the new terminal
        handeSelectTerminal(result.data.id);
        
        form.reset();
        setIsCreating(false);
        setOpen(false);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to create terminal.',
        });
      }
    } catch (error) {
      console.error('Error creating terminal:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create terminal. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
            {currentTerminalId ? 'Change Terminal' : 'Select Terminal'}
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configure This Terminal</DialogTitle>
            <DialogDescription className="sr-only">Select or create a POS terminal for this browser session</DialogDescription>
          </DialogHeader>

          {isCreating ? (
             <div className="py-4 space-y-4">
                 <div className="flex justify-between items-center mb-2">
                     <h3 className="font-medium">Create New Terminal</h3>
                     <button onClick={() => setIsCreating(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">Cancel</button>
                 </div>
                 <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="terminalDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Terminal Name (e.g. Counter 1)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Counter 1" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ipAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IP Address (Optional)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="192.168.1.xxx" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="inventoryLocation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {warehouses.length === 0 ? (
                                <SelectItem value="Store">Store (Default)</SelectItem>
                              ) : (
                                warehouses.map((w) => (
                                  <SelectItem key={w.id} value={w.id}>
                                    {w.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="zCounter"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Z Counter</FormLabel>
                                    <FormControl>
                                        <Input {...field} type="number" min="0" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="resetCounter"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Reset Counter</FormLabel>
                                    <FormControl>
                                        <Input {...field} type="number" min="0" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] w-full" disabled={isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & Select'}
                    </button>
                  </form>
                 </Form>
             </div>
          ) : (
            <div className="py-4 space-y-4">
                {isLoadingTerminals ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {terminals.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-4">No terminals found.</p>
                        ) : (
                            terminals.map(term => (
                                <div 
                                    key={term.id} 
                                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-slate-50 ${currentTerminalId === term.id ? 'border-primary bg-blue-50/50' : 'border-slate-200'}`}
                                    onClick={() => handeSelectTerminal(term.id)}
                                >
                                    <div>
                                        <p className="font-medium text-sm">{term.terminalDescription}</p>
                                        <p className="text-xs text-muted-foreground">{term.ipAddress || 'No IP'}</p>
                                    </div>
                                    {currentTerminalId === term.id && <Check className="h-4 w-4 text-primary" />}
                                </div>
                            ))
                        )}
                    </div>
                )}
                
                <Separator />
                
                <button 
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] w-full border-dashed" 
                    onClick={() => setIsCreating(true)}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Terminal
                </button>

                {currentTerminalId && (
                     <button
                        className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 w-full text-destructive hover:text-destructive/90" 
                        onClick={handleClearTerminal}
                    >
                        Disconnect from Current Terminal
                    </button>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
  );
}
