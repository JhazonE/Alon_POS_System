'use client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, RefreshCw } from 'lucide-react';
import { MODULE_OPTIONS, ACTION_OPTIONS } from './user-logs-types';

type Props = {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  moduleFilter: string;
  setModuleFilter: (v: string) => void;
  actionFilter: string;
  setActionFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  hasActiveFilters: boolean;
  onSearch: () => void;
  onClear: () => void;
  onRefresh: () => void;
  onPageReset: () => void;
};

export function UserLogsFilters({
  searchQuery, setSearchQuery,
  moduleFilter, setModuleFilter,
  actionFilter, setActionFilter,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  hasActiveFilters,
  onSearch, onClear, onRefresh, onPageReset,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Input
          placeholder="Search description, user..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch()}
          className="pr-8"
        />
        {searchQuery && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring w-10 p-0 absolute right-0 top-0 h-full px-2 hover:bg-transparent"
            onClick={() => { setSearchQuery(''); onClear(); }}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      <button onClick={onSearch} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring h-10 w-10 p-0">
        <Search className="h-4 w-4" />
      </button>

      <Select value={moduleFilter} onValueChange={v => { setModuleFilter(v); onPageReset(); }}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Module" />
        </SelectTrigger>
        <SelectContent>
          {MODULE_OPTIONS.map(m => (
            <SelectItem key={m} value={m}>{m === 'ALL' ? 'All Modules' : m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={actionFilter} onValueChange={v => { setActionFilter(v); onPageReset(); }}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Action" />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map(a => (
            <SelectItem key={a} value={a}>{a === 'ALL' ? 'All Actions' : a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); onPageReset(); }}
          className="w-[140px] text-sm"
        />
        <span className="text-muted-foreground text-sm">–</span>
        <Input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); onPageReset(); }}
          className="w-[140px] text-sm"
        />
      </div>

      <button onClick={onRefresh} title="Refresh" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0">
        <RefreshCw className="h-4 w-4" />
      </button>

      {hasActiveFilters && (
        <button onClick={onClear} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
          <X className="mr-1.5 h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
