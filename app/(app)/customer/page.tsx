'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Customer } from '@/lib/types';
import { PlusCircle } from 'lucide-react';
import CustomerList from './list/customer-list';
import AddCustomerDialog from './list/add-customer-dialog';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';

export default function CustomerListPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const { toast } = useToast();

  const fetchCustomers = async (page: number = currentPage, currentLimit: number = limit, search: string = searchQuery) => {
    setIsLoading(true);
    try {
      const offset = (page - 1) * currentLimit;
      let url = getApiUrl(`/customers?limit=${currentLimit}&offset=${offset}`);
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setCustomers(result.data);
        setTotalCount(result.pagination?.total || 0);
        setCurrentPage(page);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load customers',
        });
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load customers',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(1, limit, searchQuery);
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [searchQuery, limit]);

  const handlePageChange = (page: number) => {
    fetchCustomers(page, limit, searchQuery);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setCurrentPage(1);
  };

  const handleAddCustomer = async (customerId: string, name: string, contactNumber: string, active: boolean, loyaltyPoints: number, paymentTerms: string, address: string, billingAddress: string, discount: number, creditLimit: number, priceLevelId?: string) => {
    try {
      const response = await fetch(getApiUrl('/customers'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
          name,
          contactNumber,
          active,
          loyaltyPoints,
          paymentTerms,
          address,
          billingAddress,
          discount,
          creditLimit,
          priceLevelId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Customer added successfully',
        });
        fetchCustomers(currentPage); // Refresh current page
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to add customer',
        });
      }
    } catch (error) {
      console.error('Error adding customer:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add customer',
      });
    }
  };

  const handleUpdateCustomer = async (customerId: string, values: { name: string; contactNumber: string; active: boolean; loyaltyPoints: number; paymentTerms?: string; address?: string; billingAddress?: string; discount: number; creditLimit: number; priceLevelId?: string }) => {
    try {
      const response = await fetch(getApiUrl(`/customers/${customerId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Customer updated successfully',
        });
        fetchCustomers(currentPage); // Refresh current page
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update customer',
        });
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update customer',
      });
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    const response = await fetch(getApiUrl(`/customers/${customerId}`), {
      method: 'DELETE',
    });

    const result = await response.json();
    if (result.success) {
      // If we deleted the last item on the page, go back a page
      const newTotalCount = totalCount - 1;
      const maxPage = Math.max(1, Math.ceil(newTotalCount / limit));
      const newPage = currentPage > maxPage ? maxPage : currentPage;
      fetchCustomers(newPage, limit, searchQuery);
    } else {
      throw new Error(result.error || 'Failed to delete customer');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer List</h1>
          <p className="text-muted-foreground">
            Manage your customers and their information.
          </p>
        </div>
        <AddCustomerDialog onSave={handleAddCustomer}>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Customer
          </button>
        </AddCustomerDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            A list of all your customers including their contact information and payment terms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers by name or contact number..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    fetchCustomers(1, limit, searchQuery);
                  }
                }}
              />
            </div>
            <button 
              onClick={() => fetchCustomers(1, limit, searchQuery)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring h-10 px-[18px]"
            >
              Search
            </button>
          </div>
          <CustomerList
            customers={customers}
            isLoading={isLoading}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            totalCount={totalCount}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            itemsPerPage={limit}
            onItemsPerPageChange={handleLimitChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
