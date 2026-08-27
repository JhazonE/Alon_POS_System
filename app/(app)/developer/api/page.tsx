'use client';

import { useState } from 'react';
import { API_BASE_URL, getApiUrl } from '@/lib/api-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, Play, RefreshCw, CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ApiDashboardPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('endpoints');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [customPath, setCustomPath] = useState('');

  const endpoints = [
    { name: 'Products', path: '/products', description: 'List of all products' },
    { name: 'Accounts', path: '/accounts', description: 'List of chart of accounts' },
    { name: 'Suppliers', path: '/suppliers', description: 'List of registered suppliers' },
    { name: 'Categories', path: '/products/categories', description: 'Product categories' }, // Assuming this exists or similar
    { name: 'Warehouses', path: '/warehouses', description: 'Warehouse locations' },
  ];

  const handleTest = async (path: string) => {
    setLoading(true);
    setTestResult(null);
    setTestStatus(null);
    
    // Construct full URL. We iterate to ensure we don't double access /api if it's already in the path or base
    // But getApiUrl handles "http://host/api" + "/path" -> "http://host/api/path"
    const fullUrl = getApiUrl(path);

    try {
      const startTime = performance.now();
      const res = await fetch(fullUrl);
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(0);

      const status = res.status;
      setTestStatus(status);

      let data;
      try {
         data = await res.json();
      } catch (e) {
         data = await res.text();
      }

      setTestResult(JSON.stringify(data, null, 2));

      toast({
        title: res.ok ? "Request Successful" : "Request Failed",
        description: `Status: ${status} (${duration}ms)`,
        variant: res.ok ? "default" : "destructive",
      });

    } catch (error: any) {
      setTestResult(`Error: ${error.message}`);
      setTestStatus(0);
      toast({
        title: "Connection Error",
        description: "Failed to reach the endpoint.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: "Copied to clipboard" });
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">API Dashboard</h2>
        <Badge variant="outline" className="text-sm">
          <Globe className="mr-1 h-4 w-4" />
          {API_BASE_URL}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-140px)]">
        
        {/* Left Column: Endpoints */}
        <Card className="md:col-span-1 flex flex-col h-full">
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>Select an endpoint to test</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
             <ScrollArea className="h-full p-4 pt-0">
                <div className="space-y-4">
                  <div className="space-y-2">
                     <h3 className="text-sm font-medium text-muted-foreground mb-2">Predefined</h3>
                     {endpoints.map((ep) => (
                       <button 
                         key={ep.path} 
                         className="inline-flex items-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring w-full justify-start text-left h-auto py-3 px-4 border"
                         onClick={() => setCustomPath(ep.path)}
                       >
                         <div className="flex flex-col items-start w-full gap-1">
                           <span className="font-semibold text-primary">{ep.path}</span>
                           <span className="text-xs text-muted-foreground font-normal">{ep.description}</span>
                         </div>
                       </button>
                     ))}
                  </div>
                </div>
             </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Column: Console */}
        <Card className="md:col-span-2 flex flex-col h-full">
           <CardHeader className="pb-3">
             <CardTitle>Console</CardTitle>
             <CardDescription>Test response output</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div className="flex space-x-2">
                 <Input 
                   value={customPath}
                   onChange={(e) => setCustomPath(e.target.value)}
                   placeholder="/path/to/resource"
                   className="font-mono text-sm"
                 />
                 <button onClick={() => handleTest(customPath)} disabled={loading || !customPath} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
                    {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Send
                 </button>
              </div>

              <div className="flex-1 bg-slate-950 text-slate-50 rounded-lg p-4 font-mono text-xs overflow-auto border shadow-inner relative group">
                 {testResult ? (
                    <>
                       <button 
                         className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute top-2 right-2 h-6 w-6 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                         onClick={() => copyToClipboard(testResult)}
                       >
                         <Copy className="h-3 w-3" />
                       </button>
                       <pre className="whitespace-pre-wrap break-all">
                          {testResult}
                       </pre>
                    </>
                 ) : (
                    <div className="h-full flex items-center justify-center text-slate-500">
                       <div className="text-center space-y-2">
                          <Play className="h-8 w-8 mx-auto opacity-20" />
                          <p>Ready to test. Select an endpoint and click Send.</p>
                       </div>
                    </div>
                 )}
              </div>
           </CardContent>
           <CardFooter className="border-t pt-4 text-xs text-muted-foreground flex justify-between">
              <div>
                 Base URL: <span className="font-mono">{API_BASE_URL}</span>
              </div>
              {testStatus !== null && (
                 <div className="flex items-center">
                    Status: 
                    <Badge variant={testStatus >= 200 && testStatus < 300 ? "default" : "destructive"} className="ml-2">
                       {testStatus}
                    </Badge>
                 </div>
              )}
           </CardFooter>
        </Card>

      </div>
    </div>
  );
}
