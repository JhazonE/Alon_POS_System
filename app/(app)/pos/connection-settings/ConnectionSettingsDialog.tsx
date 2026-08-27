'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Server, Settings, CheckCircle2, XCircle, RefreshCw, Network, Monitor, Printer, ScanLine } from 'lucide-react';
import { DEFAULT_API_BASE_URL } from '@/lib/api-config';
import { useConnectionSettings } from './use-connection-settings';
import type { ConnectionSettingsDialogProps } from './connection-settings-types';

export function ConnectionSettingsDialog({ open, onOpenChange }: ConnectionSettingsDialogProps) {
  const {
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
  } = useConnectionSettings({ open, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[780px] w-full p-0 gap-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>POS Terminal Settings</DialogTitle>
        </VisuallyHidden>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="text-base font-semibold leading-none">POS Terminal Settings</div>
            <p className="text-xs mt-0.5 text-muted-foreground">
              Configure connection, terminal, and printer for this machine.
            </p>
          </div>
        </div>

        {/* Body — two columns */}
        <div className="grid grid-cols-2 divide-x">

          {/* LEFT — Connection & Terminal */}
          <div className="flex flex-col gap-5 px-6 py-5">

            {/* Server Connection */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" /> Server Connection
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="server-ip" className="text-xs">Server IP Address</Label>
                <div className="flex gap-2">
                  <Input
                    id="server-ip"
                    placeholder="e.g., 192.168.1.100"
                    value={serverIp}
                    onChange={(e) => setServerIp(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <button type="button" onClick={testConnection} disabled={isTesting} className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring rounded-lg gap-1.5 h-8 shrink-0 px-3 text-xs">
                    {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
                  </button>
                </div>
                <div className="flex items-center gap-2 min-h-[18px]">
                  {testResult === 'success' && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </span>
                  )}
                  {testResult === 'error' && (
                    <span className="flex items-center gap-1 text-[11px] text-destructive font-medium">
                      <XCircle className="h-3 w-3" /> Unreachable
                    </span>
                  )}
                  {!testResult && (
                    <span className="text-[11px] text-muted-foreground">
                      Default: <code className="bg-muted px-1 rounded">{DEFAULT_API_BASE_URL}</code>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Terminal */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5" /> POS Terminal
                </p>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-6 w-6" onClick={fetchTerminals} disabled={isLoadingTerminals}>
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingTerminals ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Network className="h-3 w-3" /> This Machine IP
                </span>
                <code className="bg-muted px-2 py-1 rounded text-xs w-fit font-mono">
                  {clientIp || 'Detecting...'}
                </code>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Linked Terminal</span>
                {selectedTerminal ? (
                  <div className="flex flex-col bg-primary/5 border border-primary/20 px-3 py-2 rounded-md">
                    <span className="text-sm font-semibold text-primary leading-tight">{selectedTerminal.terminalDescription}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{selectedTerminal.ipAddress || 'No IP'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground italic bg-muted/50 px-3 py-2 rounded-md">
                    <XCircle className="h-3 w-3 shrink-0" /> No terminal linked to this machine
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 pt-1 border-t">
                <Label htmlFor="manual-terminal-ip" className="text-xs">Override Terminal IP</Label>
                <Input
                  id="manual-terminal-ip"
                  placeholder="e.g., 192.168.1.50"
                  value={manualTerminalIp}
                  onChange={(e) => setManualTerminalIp(e.target.value)}
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Must match a registered terminal IP.</p>
              </div>
            </div>
          </div>

          {/* RIGHT — Printer Settings */}
          <div className="flex flex-col gap-5 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Printer Settings
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Paper Size</Label>
                <Select value={paperSize} onValueChange={(v) => setPaperSize(v as '58mm' | '80mm')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm">58mm — Standard</SelectItem>
                    <SelectItem value="80mm">80mm — Wide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Print Mode</Label>
                <Select value={printerMode} onValueChange={(v) => { setPrinterMode(v as any); }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="native">Native (Windows)</SelectItem>
                    <SelectItem value="epson">Epson SDK</SelectItem>
                    <SelectItem value="escpos">ESC/POS Serial</SelectItem>
                    <SelectItem value="usb">USB</SelectItem>
                    <SelectItem value="browser">Browser Print</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(printerMode === 'native' || printerMode === 'epson') && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Printer Name</Label>
                <div className="flex gap-2">
                  {availablePrinters.length > 0 ? (
                    <Select value={printerName} onValueChange={setPrinterName}>
                      <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Select printer..." /></SelectTrigger>
                      <SelectContent>
                        {availablePrinters.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="e.g., XP-58-P"
                      value={printerName}
                      onChange={(e) => setPrinterName(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                  )}
                  <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8 shrink-0" onClick={discoverPrinters} disabled={isDiscoveringPrinters} title="Scan for printers">
                    {isDiscoveringPrinters ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {availablePrinters.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">{availablePrinters.length} printer(s) found.</p>
                )}
              </div>
            )}

            {printerName && (
              <div className="flex items-center gap-2 bg-muted/60 px-3 py-2 rounded-md text-xs">
                <Printer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono font-medium truncate">{printerName}</span>
                <span className="text-muted-foreground shrink-0">· {printerMode} · {paperSize}</span>
              </div>
            )}

            <div className="flex items-center justify-between border rounded-md px-3 py-2.5 mt-auto">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium leading-none">Print 2 Receipts</span>
                <span className="text-[11px] text-muted-foreground">Print two copies on every sale</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={printTwoReceipts}
                onClick={() => setPrintTwoReceipts(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${printTwoReceipts ? 'bg-primary' : 'bg-input'}`}
              >
                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${printTwoReceipts ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-muted/30">
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">Cancel</button>
          <button onClick={handleSave} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">Save & Apply</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
