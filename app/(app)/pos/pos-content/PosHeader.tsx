'use client';
import { ThemeToggle } from '@/components/theme-toggle';
import { RefreshCw, Monitor } from 'lucide-react';

type Props = {
  shiftActive: boolean;
  currentTime: string;
  enableCustomerDisplay: boolean;
  openOnSecondScreen: () => void;
};

/**
 * Slim utility bar. The cart and shift actions live in the rails flanking the
 * cart; the business name and terminal live in the summary footer.
 */
export function PosHeader({ shiftActive, currentTime, enableCustomerDisplay, openOnSecondScreen }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${shiftActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
        <span className="text-xs font-medium text-muted-foreground">{shiftActive ? 'Shift active' : 'No active shift'}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden font-mono text-xs text-muted-foreground sm:block">{currentTime}</span>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent transition-[background-color,box-shadow,transform] hover:bg-accent hover:text-accent-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Refresh Page"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        {enableCustomerDisplay && (
          <button
            onClick={openOnSecondScreen}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent transition-[background-color,box-shadow,transform] hover:bg-accent hover:text-accent-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title="Open Customer Display"
          >
            <Monitor className="h-4 w-4" />
          </button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
