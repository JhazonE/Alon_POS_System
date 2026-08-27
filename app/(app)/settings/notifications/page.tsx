'use client';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useNotifications } from './use-notifications';
import { InventoryAlertsCard } from './InventoryAlertsCard';
import { NotificationChannelsCard } from './NotificationChannelsCard';

export default function NotificationsPage() {
  const { settings, set, isLoading, isSaving, handleSave } = useNotifications();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Notification Settings</h2>
          <p className="text-muted-foreground">Manage how you receive alerts and status updates.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/settings"><button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button></Link>
          <button onClick={handleSave} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <InventoryAlertsCard
          lowStockThreshold={settings.lowStockThreshold}
          onChange={v => set('lowStockThreshold', v)}
        />
        <NotificationChannelsCard
          enablePushNotifications={settings.enablePushNotifications}
          enableEmailNotifications={settings.enableEmailNotifications}
          notificationEmail={settings.notificationEmail}
          set={set}
        />
      </div>
    </div>
  );
}
