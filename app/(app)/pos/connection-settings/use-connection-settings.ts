'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, formatApiUrl, authFetch } from '@/lib/api-config';
import type { PrinterMode } from './connection-settings-types';

type Options = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function useConnectionSettings({ open, onOpenChange }: Options) {
  const [serverIp, setServerIp] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [isLoadingTerminals, setIsLoadingTerminals] = useState(false);
  const [manualTerminalIp, setManualTerminalIp] = useState('');
  const [printerMode, setPrinterMode] = useState<PrinterMode>('native');
  const [printerName, setPrinterName] = useState('');
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('58mm');
  const [printTwoReceipts, setPrintTwoReceipts] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [isDiscoveringPrinters, setIsDiscoveringPrinters] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setServerIp(localStorage.getItem('server_ip') || '');
      setTestResult(null);
      fetchTerminals();
      setPrinterMode((localStorage.getItem('pos_printer_mode') as PrinterMode) || 'native');
      setPrinterName(localStorage.getItem('pos_printer_name') || '');
      setPaperSize((localStorage.getItem('pos_paper_size') as '58mm' | '80mm') || '58mm');
      setPrintTwoReceipts(localStorage.getItem('pos_print_two_receipts') === 'true');
      setAvailablePrinters([]);
    }
  }, [open]);

  useEffect(() => {
    if (open && terminals.length > 0) {
      const savedTerminalId = localStorage.getItem('pos_terminal_id');
      const terminal = terminals.find(t => t.id === savedTerminalId);
      if (terminal) setManualTerminalIp(terminal.ipAddress || '');
    }
  }, [open, terminals]);

  const fetchTerminals = async () => {
    setIsLoadingTerminals(true);
    try {
      const response = await authFetch(getApiUrl('/pos-terminals?activeOnly=true'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setTerminals(result.data);
        setClientIp(result.clientIp);
      }
    } catch (error) {
      console.error('Error fetching terminals:', error);
    } finally {
      setIsLoadingTerminals(false);
    }
  };

  const discoverPrinters = async () => {
    const api = (window as any).electronAPI;
    if (!api) {
      toast({ variant: 'destructive', title: 'Not Available', description: 'Printer discovery requires the desktop app.' });
      return;
    }
    setIsDiscoveringPrinters(true);
    try {
      const list: string[] = printerMode === 'epson'
        ? (await api.listEpsonPrinters?.()) ?? []
        : (await api.listPrinters?.()) ?? [];
      setAvailablePrinters(list);
      if (list.length === 0) toast({ title: 'No Printers Found', description: 'No printers were detected on this machine.' });
    } catch {
      toast({ variant: 'destructive', title: 'Discovery Failed', description: 'Could not retrieve printer list.' });
    } finally {
      setIsDiscoveringPrinters(false);
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Plain fetch on purpose: this probes a user-typed server address, and
      // our session token must never be sent to a host we have not verified.
      const response = await fetch(formatApiUrl(serverIp.trim(), '/pos-settings'), {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      // With no token, a reachable server answers 401 (/pos-settings is no
      // longer public). Any HTTP answer means the server is reachable.
      setTestResult(
        response.ok || response.status === 401 || response.status === 403 ? 'success' : 'error'
      );
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (serverIp.trim()) {
      localStorage.setItem('server_ip', serverIp.trim());
    } else {
      localStorage.removeItem('server_ip');
    }

    if (manualTerminalIp.trim()) {
      const matched = terminals.find(t => t.ipAddress === manualTerminalIp.trim());
      if (matched) {
        localStorage.setItem('pos_terminal_id', matched.id);
      } else {
        toast({ variant: 'destructive', title: 'Terminal Not Found', description: 'The provided IP does not match any registered terminal.' });
        return;
      }
    } else {
      localStorage.removeItem('pos_terminal_id');
    }

    localStorage.setItem('pos_printer_mode', printerMode);
    localStorage.setItem('pos_paper_size', paperSize);
    localStorage.setItem('pos_print_two_receipts', String(printTwoReceipts));
    if (printerName.trim()) {
      localStorage.setItem('pos_printer_name', printerName.trim());
    } else {
      localStorage.removeItem('pos_printer_name');
    }

    toast({ title: 'Settings Saved', description: 'Connection settings have been updated. The app will reload to apply changes.' });
    onOpenChange(false);
    window.location.reload();
  };

  const selectedTerminalId = typeof window !== 'undefined' ? localStorage.getItem('pos_terminal_id') : null;
  const selectedTerminal = terminals.find(t => t.id === selectedTerminalId);

  return {
    serverIp, setServerIp,
    isTesting, testResult,
    clientIp,
    terminals, isLoadingTerminals, fetchTerminals,
    manualTerminalIp, setManualTerminalIp,
    printerMode, setPrinterMode,
    printerName, setPrinterName,
    paperSize, setPaperSize,
    printTwoReceipts, setPrintTwoReceipts,
    availablePrinters, isDiscoveringPrinters, discoverPrinters,
    testConnection, handleSave,
    selectedTerminal,
  };
}
