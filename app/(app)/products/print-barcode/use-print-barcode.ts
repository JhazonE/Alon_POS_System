'use client';

import { useMemo, useState } from 'react';

import type { Product } from '@/lib/types';

import { LABEL_SIZES, buildPrintHTML, generateBarcodeDataUrl } from './barcode-utils';

export interface UsePrintBarcodeProps {
  product: Product;
}

/**
 * Controller for the print barcode dialog: owns the label options, derives the
 * preview barcode image, and builds + opens the print window.
 */
export function usePrintBarcode({ product }: UsePrintBarcodeProps) {
  const [qty, setQty]             = useState(1);
  const [sizeIndex, setSizeIndex] = useState(0);
  const [format, setFormat]       = useState('EAN8');
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName]   = useState(true);

  const size         = LABEL_SIZES[sizeIndex];
  const barcodeValue = product.barcode || product.id;

  const dataUrl = useMemo(
    () => (barcodeValue ? generateBarcodeDataUrl(barcodeValue, format) : null),
    [barcodeValue, format],
  );

  const handlePrint = () => {
    if (!dataUrl) return;
    const html = buildPrintHTML(product, qty, size, dataUrl, showName, showPrice);
    const win = window.open('', '_blank', 'width=500,height=400,left=200,top=100');
    if (!win) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print barcodes.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  return {
    qty,
    setQty,
    sizeIndex,
    setSizeIndex,
    format,
    setFormat,
    showPrice,
    setShowPrice,
    showName,
    setShowName,
    size,
    barcodeValue,
    dataUrl,
    handlePrint,
  };
}
