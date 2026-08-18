'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ShieldAlert, ShieldCheck, Copy, Check, AlertTriangle } from 'lucide-react';

type LicenseStatus = 'unlicensed' | 'expired' | 'invalid' | 'wrong-machine' | 'active' | 'loading';

interface StatusInfo {
  status: LicenseStatus;
  machineId: string;
  expires?: string | null;
}

interface ActivationResult {
  customer: string;
  edition: string;
}

export default function ActivatePage() {
  const router = useRouter();

  const [statusInfo, setStatusInfo] = useState<StatusInfo>({ status: 'loading', machineId: '' });
  const [productKey, setProductKey] = useState('');
  const [signedKey, setSignedKey] = useState('');
  const [onlineError, setOnlineError] = useState('');
  const [offlineError, setOfflineError] = useState('');
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [activation, setActivation] = useState<ActivationResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/license/status')
      .then((r) => r.json())
      .then((res) => {
        const data = res?.data;
        if (data?.status === 'active') {
          router.replace('/login');
          return;
        }
        setStatusInfo({
          status: data?.status ?? 'unlicensed',
          machineId: data?.machineId ?? '',
          expires: data?.expires,
        });
      })
      .catch(() => {
        setStatusInfo({ status: 'unlicensed', machineId: '' });
      });
  }, [router]);

  async function handleOnlineActivate() {
    if (!productKey.trim()) return;
    setOnlineLoading(true);
    setOnlineError('');
    try {
      const res = await fetch('/api/license/activate-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productKey: productKey.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setOnlineError(json.error ?? 'Activation failed.');
        return;
      }
      setActivation({ customer: json.data?.customer ?? '', edition: json.data?.edition ?? '' });
      setTimeout(() => router.replace('/login'), 2000);
    } catch {
      setOnlineError('Could not reach the server. Check your connection and try again.');
    } finally {
      setOnlineLoading(false);
    }
  }

  async function handleOfflineActivate() {
    if (!signedKey.trim()) return;
    setOfflineLoading(true);
    setOfflineError('');
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: signedKey.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setOfflineError(json.error ?? 'Activation failed.');
        return;
      }
      setActivation({ customer: json.data?.customer ?? '', edition: json.data?.edition ?? '' });
      setTimeout(() => router.replace('/login'), 2000);
    } catch {
      setOfflineError('Activation failed. Please check the key and try again.');
    } finally {
      setOfflineLoading(false);
    }
  }

  function copyMachineId() {
    navigator.clipboard.writeText(statusInfo.machineId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function getStatusBanner() {
    const { status, expires } = statusInfo;
    if (status === 'expired') {
      const dateStr = expires ? new Date(expires).toLocaleDateString() : 'unknown date';
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        title: 'License Expired',
        message: `Your license expired on ${dateStr}. Contact your vendor to renew.`,
      };
    }
    if (status === 'wrong-machine') {
      return {
        icon: <ShieldAlert className="h-4 w-4" />,
        title: 'Wrong Machine',
        message: 'This license was issued for a different computer. Send your Machine ID to your vendor for a new key.',
      };
    }
    if (status === 'invalid') {
      return {
        icon: <ShieldAlert className="h-4 w-4" />,
        title: 'Invalid License',
        message: 'The installed license key is invalid or corrupted. Please re-activate.',
      };
    }
    return {
      icon: <ShieldAlert className="h-4 w-4" />,
      title: 'Not Activated',
      message: 'This copy of Alon POS System is not activated. Enter your license key below to continue.',
    };
  }

  if (statusInfo.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <ShieldCheck className="h-16 w-16 text-green-500" />
            <div>
              <h2 className="text-xl font-bold">Activated Successfully</h2>
              <p className="text-muted-foreground mt-1">
                {activation.customer} — {activation.edition}
              </p>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting to login…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const banner = getStatusBanner();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[440px] space-y-6 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <Logo size={72} />
          <div className="text-center">
            <h1 className="text-2xl font-bold">Alon POS System</h1>
            <p className="text-sm text-muted-foreground">Software Activation</p>
          </div>
        </div>

        <Alert variant="destructive">
          {banner.icon}
          <AlertTitle>{banner.title}</AlertTitle>
          <AlertDescription>{banner.message}</AlertDescription>
        </Alert>

        {statusInfo.machineId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Your Machine ID</CardTitle>
              <CardDescription className="text-xs">
                Send this to your vendor to receive a license key for this computer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all leading-relaxed">
                  {statusInfo.machineId}
                </code>
                <Button variant="outline" size="icon" onClick={copyMachineId} title="Copy Machine ID">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4">
            <Tabs defaultValue="online">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="online" className="flex-1">Online Activation</TabsTrigger>
                <TabsTrigger value="offline" className="flex-1">Offline Activation</TabsTrigger>
              </TabsList>

              <TabsContent value="online" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product-key">Product Key</Label>
                  <Input
                    id="product-key"
                    placeholder="VRDX-XXXX-XXXX-XXXX"
                    value={productKey}
                    onChange={(e) => setProductKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleOnlineActivate()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Requires an internet connection to the license server.
                  </p>
                </div>
                {onlineError && (
                  <Alert variant="destructive">
                    <AlertDescription>{onlineError}</AlertDescription>
                  </Alert>
                )}
                <Button
                  className="w-full"
                  onClick={handleOnlineActivate}
                  disabled={onlineLoading || !productKey.trim()}
                >
                  {onlineLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Activating…</>
                  ) : (
                    'Activate Online'
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="offline" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signed-key">Signed License Key</Label>
                  <Textarea
                    id="signed-key"
                    placeholder="VRDX1.eyJ…"
                    rows={5}
                    value={signedKey}
                    onChange={(e) => setSignedKey(e.target.value)}
                    className="font-mono text-xs resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the full signed key provided by your vendor.
                  </p>
                </div>
                {offlineError && (
                  <Alert variant="destructive">
                    <AlertDescription>{offlineError}</AlertDescription>
                  </Alert>
                )}
                <Button
                  className="w-full"
                  onClick={handleOfflineActivate}
                  disabled={offlineLoading || !signedKey.trim()}
                >
                  {offlineLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Activating…</>
                  ) : (
                    'Activate'
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
