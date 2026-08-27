'use client';
import { Input } from '@/components/ui/input';
import { Download, Upload, RefreshCw } from 'lucide-react';

interface Props {
  title: string;
  exportDescription: string;
  importDescription: string;
  exportLoading: boolean;
  onExport: () => void;
  importFile: File | null;
  importLoading: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
}

export function CsvImportExportSection({ title, exportDescription, importDescription, exportLoading, onExport, importFile, importLoading, onFileChange, onImport }: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium border-b pb-2">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 border rounded-lg space-y-3">
          <div className="font-medium flex items-center text-blue-600">
            <Download className="mr-2 h-4 w-4" /> Export {title}
          </div>
          <div className="text-sm text-muted-foreground">{exportDescription}</div>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] w-full" onClick={onExport} disabled={exportLoading}>
            {exportLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </button>
        </div>
        <div className="p-4 border rounded-lg space-y-3">
          <div className="font-medium flex items-center text-green-600">
            <Upload className="mr-2 h-4 w-4" /> Import {title}
          </div>
          <div className="text-sm text-muted-foreground">{importDescription}</div>
          <div className="flex gap-2">
            <Input type="file" accept=".csv" onChange={onFileChange} disabled={importLoading} />
            <button onClick={onImport} disabled={!importFile || importLoading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring h-10 px-[18px]">
              {importLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
