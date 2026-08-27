'use client';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Loader2 } from 'lucide-react';
import { ManagePaymentTermsDialog } from '../../settings/pos-setup/manage-payment-terms/ManagePaymentTermsDialog';
import { useAddCustomer } from './use-add-customer';

interface AddCustomerDialogProps {
  onSave: (customerId: string, name: string, contactNumber: string, active: boolean, loyaltyPoints: number, paymentTerms: string, address: string, billingAddress: string, discount: number, creditLimit: number, priceLevelId?: string) => Promise<void>;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  customer?: any;
}

export default function AddCustomerDialog({ onSave, children, open, onOpenChange, customer }: AddCustomerDialogProps) {
  const {
    isOpen,
    setIsOpen,
    form,
    isSaving,
    priceLevels,
    isLoadingPriceLevels,
    loyaltySettings,
    isLoadingLoyaltySettings,
    paymentTermsList,
    isLoadingPaymentTerms,
    sameAsAddress,
    setSameAsAddress,
    isPaymentTermsSelectOpen,
    setIsPaymentTermsSelectOpen,
    isManagePaymentTermsOpen,
    setIsManagePaymentTermsOpen,
    fetchPaymentTerms,
    handleSubmit,
  } = useAddCustomer({ open, onOpenChange, onSave, customer });

  return (
    <>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl h-[650px] flex flex-col !overflow-hidden !rounded-lg !duration-500 ease-in-out data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 data-[state=closed]:!zoom-out-95 data-[state=open]:!zoom-in-90 data-[state=closed]:!slide-out-to-top-[5%] data-[state=open]:!slide-in-from-top-[5%]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{customer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
          <DialogDescription>
            {customer ? 'Update the customer details below.' : 'Fill in the details below to add a new customer.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 px-4 py-1">
          <Form {...form}>
            <form id="add-customer-form" onSubmit={form.handleSubmit(handleSubmit)}>
              <div className="h-[480px]">
                <Tabs defaultValue="basic" className="w-full h-full">
              <TabsList className="grid w-fit grid-cols-3 mx-auto">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="address">Address</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
              </TabsList>
              <TabsContent value="basic" className="space-y-4 p-6 h-[400px]">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Auto-generated" {...field} readOnly />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="e.g., 09171234567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Enable or disable the customer account
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="address" className="space-y-4 p-6 h-[400px]">
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., 123 Main St, City, Country"
                            {...field}
                            rows={2}
                            onChange={(e) => {
                              field.onChange(e);
                              if (sameAsAddress) {
                                form.setValue('billingAddress', e.target.value);
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingAddress"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex flex-row items-center justify-between">
                          <FormLabel>Billing Address</FormLabel>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Same as Address</span>
                            <Switch
                              checked={sameAsAddress}
                              onCheckedChange={(checked) => {
                                setSameAsAddress(checked);
                                if (checked) {
                                  form.setValue('billingAddress', form.getValues('address'));
                                }
                              }}
                            />
                          </div>
                        </div>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., 123 Main St, City, Country"
                            {...field}
                            rows={2}
                            disabled={sameAsAddress}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
              <TabsContent value="financial" className="space-y-4 p-6 h-[400px]">
                  <FormField
                    control={form.control}
                    name="paymentTerms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Terms</FormLabel>
                        <Select 
                          open={isPaymentTermsSelectOpen} 
                          onOpenChange={setIsPaymentTermsSelectOpen}
                          onValueChange={field.onChange} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Payment Terms" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingPaymentTerms ? (
                              <SelectItem value="loading" disabled>Loading...</SelectItem>
                            ) : (
                              paymentTermsList?.map(term => (
                                <SelectItem key={term.id} value={term.description}>
                                  {term.description}
                                </SelectItem>
                              ))
                            )}
                            <div className="border-t mt-1 pt-1">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring w-full justify-start h-8 px-2 text-sm"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsManagePaymentTermsOpen(true);
                                    setIsPaymentTermsSelectOpen(false);
                                  }}
                                >
                                  <PlusCircle className="mr-2 h-4 w-4" />
                                  Add Payment Terms
                                </button>
                            </div>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="discount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount (%)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" max="100" placeholder="e.g., 10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="creditLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credit Limit</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" placeholder="e.g., 50000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="loyaltyPoints"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center h-8">
                          <FormLabel>Loyalty Points Setting</FormLabel>
                        </div>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Loyalty Points Setting" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingLoyaltySettings ? (
                               <SelectItem value="loading" disabled>Loading...</SelectItem>
                            ) : loyaltySettings.length > 0 ? (
                                loyaltySettings.map((setting) => (
                                  <SelectItem key={setting.id} value={setting.amount.toString()}>
                                    {setting.description} ({setting.amount} points)
                                  </SelectItem>
                                ))
                            ) : (
                                <>
                                  <SelectItem value="0">None (0 points)</SelectItem>
                                </>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priceLevelId"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center h-8">
                          <FormLabel>Default Price Level</FormLabel>
                        </div>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Price Level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingPriceLevels ? (
                              <SelectItem value="loading" disabled>Loading...</SelectItem>
                            ) : (
                              priceLevels?.map(level => (
                                <SelectItem key={level.id} value={level.id}>
                                  {level.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
                </Tabs>
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="flex-shrink-0">
          <button type="button" onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            Cancel
          </button>
          <button type="submit" form="add-customer-form" disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {customer ? 'Updating Customer...' : 'Adding Customer...'}
              </>
            ) : (
              customer ? 'Update Customer' : 'Add Customer'
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ManagePaymentTermsDialog 
      open={isManagePaymentTermsOpen}
      onOpenChange={setIsManagePaymentTermsOpen}
      onPaymentTermsUpdated={fetchPaymentTerms}
      trigger={null}
    />
    </>
  );
}
