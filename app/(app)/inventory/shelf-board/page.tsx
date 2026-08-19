import { Metadata } from 'next';
import ShelfBoard from './ShelfBoard';

export const metadata: Metadata = {
  title: 'Shelf Transfer Board | Alon POS',
  description: 'Manage and transfer product shelf locations using a Kanban-style board.',
};

export default function ShelfTransferBoardPage() {
  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] p-3 sm:p-6 lg:p-8 space-y-3 sm:space-y-4 max-w-full overflow-hidden bg-background">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0 shrink-0 w-full min-w-0">
        <div className="w-full min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight truncate leading-none">Shelf Transfer Board</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Drag and drop products to manage their shelf locations.</p>
        </div>
      </div>
      <div className="flex-1 w-full overflow-hidden relative z-0 min-h-0">
        <ShelfBoard />
      </div>
    </div>
  );
}
