'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, RefreshCw, Save } from 'lucide-react';

interface Props {
  dbConfig: { host: string; port: string; user: string; password: string; database: string };
  connectionStatus: 'none' | 'success' | 'error';
  statusMessage: string;
  loading: boolean;
  isTesting: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTest: () => void;
  onSave: () => void;
}

export function DatabaseConnectionTab({ dbConfig, connectionStatus, statusMessage, loading, isTesting, onInputChange, onTest, onSave }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Database Configuration</CardTitle>
        <CardDescription>
          Configure the connection details for your MySQL database.
          <br />
          <span className="text-destructive font-medium">Warning:</span> Changing these settings requires a server restart.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connectionStatus === 'success' && (
          <Alert className="border-green-500 bg-green-50 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}
        {connectionStatus === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="host">Host</Label>
            <Input id="host" name="host" value={dbConfig.host} onChange={onInputChange} placeholder="localhost" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input id="port" name="port" value={dbConfig.port} onChange={onInputChange} placeholder="3306" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user">Username</Label>
            <Input id="user" name="user" value={dbConfig.user} onChange={onInputChange} placeholder="root" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" value={dbConfig.password} onChange={onInputChange} placeholder="Use existing if empty" />
            <p className="text-[0.8rem] text-muted-foreground">Leave empty to keep the current password.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="database">Database Name</Label>
            <Input id="database" name="database" value={dbConfig.database} onChange={onInputChange} placeholder="alon_pos" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <button onClick={onTest} disabled={isTesting || loading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
          {isTesting ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Testing...</> : 'Test Connection'}
        </button>
        <button onClick={onSave} disabled={isTesting || loading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
          {loading ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Changes</>}
        </button>
      </CardFooter>
    </Card>
  );
}
