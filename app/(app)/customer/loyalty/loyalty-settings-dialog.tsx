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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Settings, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { getApiUrl } from '@/lib/api-config';

const loyaltySettingSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  base: z.enum(['amount', 'quantity'], { required_error: 'Base is required' }),
  amount: z.coerce.number().min(0, 'Amount must be non-negative'),
  equivalent: z.coerce.number().min(0, 'Equivalent must be non-negative'),
});

type LoyaltySettingFormValues = z.infer<typeof loyaltySettingSchema>;

interface LoyaltySetting {
  id: string;
  description: string;
  base: 'amount' | 'quantity';
  amount: number;
  equivalent: number;
}

// Function to save loyalty setting to database
async function saveLoyaltySettingToDatabase(setting: Omit<LoyaltySetting, 'id'>): Promise<LoyaltySetting> {
  const id = Date.now().toString();
  const response = await fetch(getApiUrl('/loyalty-settings'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
      ...setting,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to save loyalty setting');
  }

  const result = await response.json();
  return {
    id,
    ...setting,
  };
}

function AddLoyaltySettingDialog({ onSave }: { onSave: (setting: LoyaltySetting) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<LoyaltySettingFormValues>({
    resolver: zodResolver(loyaltySettingSchema),
    defaultValues: {
      description: '',
      base: 'amount',
      amount: 0,
      equivalent: 0,
    },
  });

  async function onSubmit(values: LoyaltySettingFormValues) {
    try {
      setIsLoading(true);
      console.log('Adding loyalty setting:', values);
      const savedSetting = await saveLoyaltySettingToDatabase(values);
      onSave(savedSetting);
      toast({
        title: 'Setting Added',
        description: 'Loyalty setting has been added successfully.',
      });
      setIsOpen(false);
      form.reset();
    } catch (error) {
      console.error('Failed to save loyalty setting:', error);
      toast({
        title: 'Error',
        description: 'Failed to save loyalty setting. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
          <Plus className="mr-2 h-4 w-4" />
          Add Settings
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Loyalty Setting</DialogTitle>
          <DialogDescription>
            Configure a new loyalty points setting.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Gold Membership" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="base"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select base type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="amount">Amount</SelectItem>
                        <SelectItem value="quantity">Quantity</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="equivalent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equivalent</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                Cancel
              </button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
                Add Setting
              </button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditLoyaltySettingDialog({
  setting,
  onSave,
  onCancel
}: {
  setting: LoyaltySetting;
  onSave: (setting: LoyaltySetting) => void;
  onCancel: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<LoyaltySettingFormValues>({
    resolver: zodResolver(loyaltySettingSchema),
    defaultValues: {
      description: setting.description,
      base: setting.base,
      amount: setting.amount,
      equivalent: setting.equivalent,
    },
  });

  async function onSubmit(values: LoyaltySettingFormValues) {
    try {
      setIsLoading(true);
      const updatedSetting = { ...setting, ...values };
      onSave(updatedSetting);
    } catch (error) {
      console.error('Failed to update loyalty setting:', error);
      toast({
        title: 'Error',
        description: 'Failed to update loyalty setting. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Loyalty Setting</DialogTitle>
          <DialogDescription>
            Update the loyalty points setting configuration.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Gold Membership" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="base"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select base type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="amount">Amount</SelectItem>
                        <SelectItem value="quantity">Quantity</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="equivalent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equivalent</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <button type="button" onClick={onCancel} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                Cancel
              </button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
                Update Setting
              </button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function LoyaltySettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<LoyaltySetting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingSetting, setEditingSetting] = useState<LoyaltySetting | null>(null);
  const [deleteSetting, setDeleteSetting] = useState<LoyaltySetting | null>(null);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(getApiUrl('/loyalty-settings'));
      if (response.ok) {
        const result = await response.json();
        setSettings(result.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch loyalty settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const handleAddSetting = (newSetting: LoyaltySetting) => {
    setSettings(prev => [...prev, newSetting]);
  };

  const handleEditSetting = (setting: LoyaltySetting) => {
    setEditingSetting(setting);
  };

  const handleUpdateSetting = async (updatedSetting: LoyaltySetting) => {
    try {
      const response = await fetch(getApiUrl(`/loyalty-settings/${updatedSetting.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSetting),
      });

      if (!response.ok) {
        throw new Error('Failed to update loyalty setting');
      }

      setSettings(prev => prev.map(s => s.id === updatedSetting.id ? updatedSetting : s));
      setEditingSetting(null);
      toast({
        title: 'Setting Updated',
        description: 'Loyalty setting has been updated successfully.',
      });
    } catch (error) {
      console.error('Failed to update loyalty setting:', error);
      toast({
        title: 'Error',
        description: 'Failed to update loyalty setting. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSetting = async (id: string) => {
    try {
      const response = await fetch(getApiUrl(`/loyalty-settings/${id}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete loyalty setting');
      }

      setSettings(prev => prev.filter(s => s.id !== id));
      setDeleteSetting(null);
      toast({
        title: 'Setting Deleted',
        description: 'Loyalty setting has been deleted successfully.',
      });
    } catch (error) {
      console.error('Failed to delete loyalty setting:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete loyalty setting. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            <Settings className="mr-2 h-4 w-4" />
            Loyalty Points Settings
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Loyalty Points Settings</DialogTitle>
            <DialogDescription>
              Manage loyalty points configuration and tiers.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-4">
            <AddLoyaltySettingDialog onSave={handleAddSetting} />
          </div>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Base</TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">Equivalent</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((setting) => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-medium">{setting.description}</TableCell>
                    <TableCell className="text-center">{setting.base}</TableCell>
                    <TableCell className="text-center">{setting.amount}</TableCell>
                    <TableCell className="text-center">{setting.equivalent}</TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-[100]">
                          <DropdownMenuItem onClick={() => handleEditSetting(setting)}>
                            <Edit className="mr-2 h-4 w-4" />
                            <span>Edit</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeleteSetting(setting)} 
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editingSetting && (
        <EditLoyaltySettingDialog
          setting={editingSetting}
          onSave={handleUpdateSetting}
          onCancel={() => setEditingSetting(null)}
        />
      )}
      <AlertDialog open={!!deleteSetting} onOpenChange={(open) => !open && setDeleteSetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loyalty Setting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteSetting?.description}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteSetting && handleDeleteSetting(deleteSetting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
