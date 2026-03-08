import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@flowindex/flow-ui';
import {
  Loader2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileCode2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@flowindex/auth-ui';
import { useWallet } from '@/hooks/useWallet';

const API_URL = import.meta.env.VITE_API_URL || 'https://flowindex.io';

interface ApprovalDetails {
  status: string;
  tx_message_hex: string;
  cadence_script: string;
  cadence_args: string;
  description: string;
  expires_at: string;
}

export default function Approve() {
  const { requestId } = useParams<{ requestId: string }>();
  const { accessToken, passkey, loading: authLoading } = useAuth();
  const { activeAccount, loading: walletLoading } = useWallet();

  const [details, setDetails] = useState<ApprovalDetails | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [scriptExpanded, setScriptExpanded] = useState(false);

  // Fetch approval request details
  useEffect(() => {
    if (!requestId || !accessToken) return;

    let cancelled = false;
    setFetching(true);
    setFetchError(null);

    fetch(`${API_URL}/api/v1/wallet/approve/${requestId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setDetails(json.data ?? json);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : 'Failed to load request');
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId, accessToken]);

  // Parse Cadence script details
  const scriptInfo = useMemo(() => {
    if (!details?.cadence_script) return null;
    const lines = details.cadence_script.split('\n');
    return {
      full: details.cadence_script,
      preview: lines.slice(0, 10).join('\n'),
      lineCount: lines.length,
      hasMoreLines: lines.length > 10,
    };
  }, [details]);

  // Parse arguments
  const args = useMemo(() => {
    if (!details?.cadence_args) return [];
    try {
      return JSON.parse(details.cadence_args);
    } catch {
      return [];
    }
  }, [details]);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!details?.expires_at) return;
    const expiresAt = new Date(details.expires_at).getTime();

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [details?.expires_at]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isExpired = details?.status === 'expired' || (timeLeft !== null && timeLeft <= 0);
  const isAlreadyApproved = details?.status === 'approved';

  // Handle approve
  const handleApprove = useCallback(async () => {
    if (!details || !passkey || !activeAccount || !accessToken || !requestId) return;

    setSigning(true);
    setSignError(null);

    try {
      // Sign the transaction message with passkey
      const result = await passkey.sign(details.tx_message_hex);

      // Submit signature to backend
      const res = await fetch(`${API_URL}/api/v1/wallet/approve/${requestId}/sign`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature: result.signature,
          credential_id: activeAccount.credentialId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Sign failed (${res.status})`);
      }

      setApproved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signing failed';
      // Don't show error for user cancellation
      if (message.includes('cancelled') || message.includes('canceled')) {
        setSigning(false);
        return;
      }
      setSignError(message);
      setSigning(false);
    }
  }, [details, passkey, activeAccount, accessToken, requestId]);

  // Loading states
  if (authLoading || walletLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-wallet-accent mb-3" />
            <p className="text-sm text-wallet-muted font-mono">Loading wallet...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not authenticated
  if (!accessToken) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-white font-semibold">Sign in required</p>
            <p className="text-xs text-wallet-muted text-center">
              Please sign in to your wallet to approve this request.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetching details
  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-wallet-accent mb-3" />
            <p className="text-sm text-wallet-muted font-mono">Loading approval request...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch error
  if (fetchError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-white font-semibold">Request not found</p>
            <p className="text-xs text-wallet-muted text-center">{fetchError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (approved) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="w-14 h-14 rounded-full bg-wallet-accent/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-wallet-accent" />
            </div>
            <p className="text-lg text-white font-semibold">Approved</p>
            <p className="text-xs text-wallet-muted text-center">
              Transaction has been signed and approved. You can close this page.
            </p>
            <Button
              variant="outline"
              onClick={() => window.close()}
              className="mt-2 border-wallet-border text-wallet-muted hover:text-white hover:border-wallet-border/80 rounded-xl"
            >
              Close
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already approved
  if (isAlreadyApproved) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
            <CheckCircle2 className="w-8 h-8 text-wallet-accent" />
            <p className="text-sm text-white font-semibold">Already approved</p>
            <p className="text-xs text-wallet-muted text-center">
              This request has already been approved.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Expired
  if (isExpired) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
            <Clock className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-white font-semibold">Request expired</p>
            <p className="text-xs text-wallet-muted text-center">
              This approval request has expired. Please request a new one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No active account
  if (!activeAccount || !activeAccount.flowAddress) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
        <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-white font-semibold">No account available</p>
            <p className="text-xs text-wallet-muted text-center">
              No Flow account is available for signing. Please set up your wallet first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-wallet-bg">
      <Card className="w-full max-w-[440px] mx-4 bg-wallet-surface border-wallet-border rounded-3xl">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-wallet-accent" />
            <CardTitle className="text-base font-semibold text-white">Approve Transaction</CardTitle>
          </div>
          {/* Countdown timer */}
          {timeLeft !== null && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-wallet-muted font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Expires in {formatTime(timeLeft)}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {signError && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-mono">
              {signError}
            </div>
          )}

          {/* Description */}
          {details?.description && (
            <div className="rounded-xl border border-wallet-border bg-wallet-bg/50 px-3 py-2.5">
              <span className="text-[10px] font-mono text-wallet-muted uppercase tracking-wider">Description</span>
              <p className="text-sm text-white mt-1">{details.description}</p>
            </div>
          )}

          {/* Cadence script */}
          {scriptInfo && (
            <div className="rounded-xl border border-wallet-border bg-wallet-bg/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setScriptExpanded(!scriptExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-wallet-surface/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-3.5 h-3.5 text-wallet-muted" />
                  <span className="text-xs font-mono text-wallet-muted">
                    Cadence Script ({scriptInfo.lineCount} lines)
                  </span>
                </div>
                {scriptInfo.hasMoreLines && (
                  scriptExpanded
                    ? <ChevronUp className="w-3.5 h-3.5 text-wallet-muted" />
                    : <ChevronDown className="w-3.5 h-3.5 text-wallet-muted" />
                )}
              </button>
              <div className="px-3 pb-2">
                <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto leading-relaxed">
                  {scriptExpanded ? scriptInfo.full : scriptInfo.preview}
                  {!scriptExpanded && scriptInfo.hasMoreLines && (
                    <span className="text-wallet-muted">{'\n'}... ({scriptInfo.lineCount - 10} more lines)</span>
                  )}
                </pre>
              </div>
            </div>
          )}

          {/* Arguments */}
          {args.length > 0 && (
            <div className="rounded-xl border border-wallet-border bg-wallet-bg/50 px-3 py-2.5">
              <span className="text-[10px] font-mono text-wallet-muted uppercase tracking-wider">
                Arguments ({args.length})
              </span>
              <div className="mt-1.5 space-y-1">
                {args.map((arg: { type?: string; value?: string }, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-mono">
                    <span className="text-wallet-muted shrink-0">
                      {arg.type || `arg${i}`}:
                    </span>
                    <span className="text-zinc-300 break-all">
                      {typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signing account */}
          <div className="rounded-xl border border-wallet-border bg-wallet-bg/50 px-3 py-2">
            <span className="text-[10px] font-mono text-wallet-muted uppercase tracking-wider">Signing as</span>
            <p className="text-xs font-mono text-zinc-300 mt-0.5">
              0x{activeAccount.flowAddress}
            </p>
          </div>

          {/* Approve button */}
          <div className="pt-1">
            <Button
              onClick={handleApprove}
              disabled={signing || !passkey}
              className="w-full bg-wallet-accent hover:bg-wallet-accent/90 text-black font-semibold rounded-xl disabled:opacity-50"
            >
              {signing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Signing...
                </>
              ) : (
                'Approve Transaction'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
