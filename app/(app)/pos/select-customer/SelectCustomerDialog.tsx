'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PlusCircle } from 'lucide-react';
import { AddCustomerDialog } from '../add-customer/AddCustomerDialog';
import { SearchDebounce } from './SearchDebounce';
import { useSelectCustomer } from './use-select-customer';
import { WALK_IN_CUSTOMER, getInitials } from './select-customer-utils';
import type { SelectCustomerDialogProps } from './select-customer-types';
import { Spinner } from '@/components/ui/spinner';

export function SelectCustomerDialog({
  isOpen,
  onOpenChange,
  onSelectCustomer
}: SelectCustomerDialogProps) {
  const {
    customers,
    isLoading,
    isAddCustomerOpen,
    setIsAddCustomerOpen,
    searchQuery,
    setSearchQuery,
    fetchCustomers,
    handleSelect,
    handleCustomerAdded,
  } = useSelectCustomer({
    isOpen,
    onOpenChange,
    onSelectCustomer,
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Select a Customer</DialogTitle>
            <DialogDescription>
              Search for an existing customer or add a new one.
            </DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type a customer name or contact number..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <SearchDebounce query={searchQuery} onSearch={fetchCustomers} />

            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : (
                <>
                  <CommandEmpty>No customers found.</CommandEmpty>
                  <CommandGroup>
                    {customers.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        value={`${customer.name} ${customer.contactNumber}`}
                        onSelect={() => handleSelect(customer)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-sm text-muted-foreground">{customer.contactNumber}</p>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
          <DialogFooter className="sm:justify-between">
            <button onClick={() => setIsAddCustomerOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Customer
            </button>
            <div className="flex gap-2">
              <button onClick={() => handleSelect(WALK_IN_CUSTOMER)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring h-10 px-[18px]">Select Walk-in</button>
              <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                Close
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddCustomerDialog
        isOpen={isAddCustomerOpen}
        onOpenChange={setIsAddCustomerOpen}
        onCustomerAdded={handleCustomerAdded}
      />
    </>
  );
}

export { WALK_IN_CUSTOMER } from './select-customer-utils';
