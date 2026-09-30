'use client';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Category, Brand } from '@/lib/types';

import { useAddProductFormContext } from '../add-product-form-context';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { CategorySubcategoryPicker } from '../../components/category-subcategory-picker';
import { addBrand, updateBrand, addCategory, updateCategory, addSubcategory, updateSubcategory } from '../../actions';

export function BasicInfoTab() {
  const {
    form,
    brands, isLoadingBrands,
    categories, isLoadingCategories,
    subcategories, isLoadingSubcategories,
    selects, setSelects,
    refreshBrands,
    refreshCategories,
    refreshSubcategories,
  } = useAddProductFormContext();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Row 1: Name and Brand */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Product Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g., Cola-Cola" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="brand"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand</FormLabel>
            <InlineEditableSelect
              items={brands}
              isLoading={isLoadingBrands}
              value={field.value}
              onChange={field.onChange}
              open={selects.brands}
              onOpenChange={(o) => setSelects((p) => ({ ...p, brands: o }))}
              placeholder="Select a brand"
              addLabel="Add Brand"
              emptyLabel="No brands found"
              getId={(b: Brand) => b.id}
              getValue={(b: Brand) => b.name}
              getOptionLabel={(b: Brand) => b.name}
              getName={(b: Brand) => b.name}
              onAdd={async (name) => {
                const r = await addBrand(name, 0);
                if (r.success) { await refreshBrands(); return name; }
                return undefined;
              }}
              onRename={async (id, name) => {
                const existing = brands.find((b: Brand) => b.id === id);
                const r = await updateBrand(id, name, existing?.markupPercentage);
                if (r.success) { await refreshBrands(); return name; }
                return undefined;
              }}
            />
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Row 2: Category / Subcategory and Description */}
      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Category / Subcategory</FormLabel>
            <CategorySubcategoryPicker
              categories={categories}
              subcategories={subcategories}
              isLoadingCategories={isLoadingCategories}
              isLoadingSubcategories={isLoadingSubcategories}
              category={field.value}
              subcategory={form.watch('subcategory') ?? ''}
              onCategoryChange={field.onChange}
              onSubcategoryChange={(v) => form.setValue('subcategory', v, { shouldDirty: true, shouldValidate: true })}
              onAddCategory={async (name) => {
                const r = await addCategory(name, 0);
                if (r.success) { await refreshCategories(); return name; }
                return undefined;
              }}
              onRenameCategory={async (id, name) => {
                const existing = categories.find((c: Category) => c.id === id);
                const r = await updateCategory(id, name, existing?.markupPercentage);
                if (r.success) { await refreshCategories(); return name; }
                return undefined;
              }}
              onAddSubcategory={async (name) => {
                const r = await addSubcategory(name, 0);
                if (r.success) { await refreshSubcategories(); return name; }
                return undefined;
              }}
              onRenameSubcategory={async (id, name) => {
                const existing = subcategories.find((s: Category) => s.id === id);
                const r = await updateSubcategory(id, name, existing?.markupPercentage);
                if (r.success) { await refreshSubcategories(); return name; }
                return undefined;
              }}
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="A short description of the product."
                {...field}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Row 3: Additional Description (full width) */}
      <FormField
        control={form.control}
        name="additionalDescription"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Additional Description (Optional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Provide additional details like specifications or special notes."
                {...field}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
