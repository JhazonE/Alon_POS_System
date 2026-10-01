'use client';

import { useEditProductFormContext } from '../edit-product-form-context';
import { SupplierMappingsPanel } from '../../components/supplier-mappings-panel';

export function SuppliersTab() {
  const {
    form,
    product,
    suppliers, isLoadingSuppliers,
    refreshSuppliers,
    supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,
    isLoadingMappings, mappingsLoadError,
  } = useEditProductFormContext();

  // Services have no suppliers — the tab is not rendered for them.
  if (product?.type === 'service') return null;

  return (
    <SupplierMappingsPanel
      form={form}
      suppliers={suppliers}
      isLoadingSuppliers={isLoadingSuppliers}
      refreshSuppliers={refreshSuppliers}
      supplierMappingFields={supplierMappingFields}
      addSupplierMapping={addSupplierMapping}
      removeSupplierMapping={removeSupplierMapping}
      setPrimarySupplierRow={setPrimarySupplierRow}
      isLoadingMappings={isLoadingMappings}
      loadError={mappingsLoadError}
    />
  );
}
