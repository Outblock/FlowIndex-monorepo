import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useWallet } from '@flowindex/wallet-core';
import { usePendingRequests } from '../stores/pending-requests';
import type { PendingRequest } from '../stores/pending-requests';
import type { Address, Hex } from 'viem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WCSession {
  topic: string;
  peerName: string;
  peerUrl: string;
  peerIcon?: string;
  chains: string[];
  connectedAt: number;
}

interface WalletConnectContextValue {
  initialized: boolean;
  sessions: WCSession[];
  pair: (uri: string) => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
}

const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

export function useWalletConnect(): WalletConnectContextValue {
  const ctx = useContext(WalletConnectContext);
  if (!ctx) throw new Error('useWalletConnect must be used within WalletConnectProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WC_PROJECT_ID = '39d7c0c723726953bc312950113463b4';
const WC_METADATA = {
  name: 'FlowIndex Wallet',
  description: 'Smart wallet for Flow EVM',
  url: 'https://flowindex.io',
  icons: ['https://flowindex.io/icon-192.png'],
};

const RP_ID = 'flowindex.io';

// EIP-155 chain IDs for Flow EVM
const FLOW_EVM_MAINNET = 'eip155:747';
const FLOW_EVM_TESTNET = 'eip155:545';
const SUPPORTED_CHAINS = [FLOW_EVM_MAINNET, FLOW_EVM_TESTNET];
const SUPPORTED_METHODS = [
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData_v4',
];
const SUPPORTED_EVENTS = ['chainChanged', 'accountsChanged'];

// ---------------------------------------------------------------------------
// Helper: chain ID string to Network
// ---------------------------------------------------------------------------

function chainIdToNetwork(chainId: string | number): 'mainnet' | 'testnet' {
  const id = typeof chainId === 'string' ? parseInt(chainId.split(':').pop() ?? '747', 10) : chainId;
  return id === 545 ? 'testnet' : 'mainnet';
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [sessions, setSessions] = useState<WCSession[]>([]);
  const web3walletRef = useRef<any>(null);

  const router = useRouter();
  const { activeAccount, evmAddress, network } = useWallet();
  const pendingRequests = usePendingRequests();

  // Stable refs so event handlers always see latest values
  const walletRef = useRef({ activeAccount, evmAddress, network });
  useEffect(() => {
    walletRef.current = { activeAccount, evmAddress, network };
  }, [activeAccount, evmAddress, network]);

  const pendingRef = useRef(pendingRequests);
  useEffect(() => {
    pendingRef.current = pendingRequests;
  }, [pendingRequests]);

  // ----- Init WC -----
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        // Import compat shim first (must run before WC core)
        await import('@walletconnect/react-native-compat');

        const { Core } = await import('@walletconnect/core');
        const { Web3Wallet } = await import('@walletconnect/web3wallet');

        const core = new Core({ projectId: WC_PROJECT_ID });
        const wallet = await Web3Wallet.init({
          core,
          metadata: WC_METADATA,
        });

        if (!mounted) return;
        web3walletRef.current = wallet;

        // Load existing sessions
        refreshSessions(wallet);

        // ---- session_proposal ----
        wallet.on('session_proposal', async (proposal: any) => {
          const { id, params } = proposal;
          const peer = params.proposer.metadata;
          const { activeAccount: acct, evmAddress: evm } = walletRef.current;

          if (!acct || !evm) {
            await wallet.rejectSession({ id, reason: { code: 4001, message: 'No active account' } });
            return;
          }

          const requestId = `wc_session_${id}`;
          const mainnetAccount = `${FLOW_EVM_MAINNET}:${evm}`;
          const testnetAccount = `${FLOW_EVM_TESTNET}:${evm}`;

          const pending: PendingRequest = {
            id: requestId,
            type: 'wc_session',
            dapp: {
              name: peer.name || 'Unknown dApp',
              url: peer.url || '',
              icon: peer.icons?.[0],
            },
            payload: {
              proposalId: id,
              requiredChains: params.requiredNamespaces?.eip155?.chains ?? [],
              onApprove: async () => {
                const session = await wallet.approveSession({
                  id,
                  namespaces: {
                    eip155: {
                      accounts: [mainnetAccount, testnetAccount],
                      methods: SUPPORTED_METHODS,
                      events: SUPPORTED_EVENTS,
                      chains: SUPPORTED_CHAINS,
                    },
                  },
                });
                refreshSessions(wallet);
                return session;
              },
              onReject: async () => {
                await wallet.rejectSession({
                  id,
                  reason: { code: 4001, message: 'User rejected' },
                });
              },
            },
            callback: '',
            chainType: 'evm',
            createdAt: Date.now(),
          };

          pendingRef.current.add(pending);
          router.push(`/approve/${requestId}`);
        });

        // ---- session_request ----
        wallet.on('session_request', async (event: any) => {
          const { id, topic, params } = event;
          const { request, chainId } = params;
          const { method } = request;
          const { activeAccount: acct, evmAddress: evm } = walletRef.current;

          const session = wallet.engine?.signClient?.session?.get(topic);
          const peer = session?.peer?.metadata ?? { name: 'dApp', url: '' };

          if (!acct || !evm) {
            await wallet.respondSessionRequest({
              topic,
              response: { id, jsonrpc: '2.0', error: { code: 4001, message: 'No active account' } },
            });
            return;
          }

          const requestId = `wc_req_${id}`;
          const net = chainIdToNetwork(chainId);

          // Build the onApprove callback based on the method
          let onApprove: () => Promise<void>;
          let navigateTo: string;

          if (method === 'personal_sign') {
            // params: [message, address]
            const message = request.params[0] as Hex;
            navigateTo = `/sign/${requestId}`;

            onApprove = async () => {
              const { signMessageWithPasskeyPortable } = await import('@flowindex/evm-wallet');
              const signature = await signMessageWithPasskeyPortable({
                message,
                credentialId: acct.credentialId,
                smartWalletAddress: evm as Address,
                network: net,
                rpId: RP_ID,
              });
              await wallet.respondSessionRequest({
                topic,
                response: { id, jsonrpc: '2.0', result: signature },
              });
            };
          } else if (method === 'eth_signTypedData_v4') {
            // params: [address, typedDataJSON]
            const typedData = JSON.parse(request.params[1]);
            navigateTo = `/sign/${requestId}`;

            onApprove = async () => {
              const { signTypedDataWithPasskeyPortable } = await import('@flowindex/evm-wallet');
              const signature = await signTypedDataWithPasskeyPortable({
                typedData,
                credentialId: acct.credentialId,
                smartWalletAddress: evm as Address,
                network: net,
                rpId: RP_ID,
              });
              await wallet.respondSessionRequest({
                topic,
                response: { id, jsonrpc: '2.0', result: signature },
              });
            };
          } else if (method === 'eth_sendTransaction') {
            // params: [{ from, to, value, data, gas }]
            const txParams = request.params[0];
            navigateTo = `/approve/${requestId}`;

            onApprove = async () => {
              const { sendTransactionWithPasskey } = await import('@flowindex/evm-wallet');
              const result = await sendTransactionWithPasskey({
                tx: {
                  to: txParams.to as Address,
                  value: txParams.value ? BigInt(txParams.value) : 0n,
                  data: (txParams.data ?? '0x') as Hex,
                },
                credentialId: acct.credentialId,
                smartWalletAddress: evm as Address,
                publicKeySec1Hex: acct.publicKeySec1Hex,
                network: net,
                rpId: RP_ID,
              });
              await wallet.respondSessionRequest({
                topic,
                response: { id, jsonrpc: '2.0', result: result.transactionHash ?? result.userOpHash },
              });
            };
          } else {
            // Unsupported method
            await wallet.respondSessionRequest({
              topic,
              response: { id, jsonrpc: '2.0', error: { code: 4200, message: `Unsupported method: ${method}` } },
            });
            return;
          }

          const pending: PendingRequest = {
            id: requestId,
            type: 'wc_request',
            dapp: {
              name: peer.name || 'Unknown dApp',
              url: peer.url || '',
              icon: peer.icons?.[0],
            },
            payload: {
              method,
              params: request.params,
              message: method === 'personal_sign' ? request.params[0] : undefined,
              typedData: method === 'eth_signTypedData_v4' ? request.params[1] : undefined,
              tx: method === 'eth_sendTransaction' ? request.params[0] : undefined,
              onApprove,
              onReject: async () => {
                await wallet.respondSessionRequest({
                  topic,
                  response: { id, jsonrpc: '2.0', error: { code: 4001, message: 'User rejected' } },
                });
              },
            },
            callback: '',
            chainType: 'evm',
            method,
            createdAt: Date.now(),
          };

          pendingRef.current.add(pending);
          router.push(navigateTo);
        });

        // ---- session_delete ----
        wallet.on('session_delete', () => {
          refreshSessions(wallet);
        });

        setInitialized(true);
      } catch (err) {
        console.error('[WalletConnect] Init failed:', err);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // ----- Helpers -----
  function refreshSessions(wallet: any) {
    const active = wallet.getActiveSessions?.() ?? {};
    const list: WCSession[] = Object.values(active).map((s: any) => ({
      topic: s.topic,
      peerName: s.peer?.metadata?.name ?? 'Unknown',
      peerUrl: s.peer?.metadata?.url ?? '',
      peerIcon: s.peer?.metadata?.icons?.[0],
      chains: s.namespaces?.eip155?.chains ?? [],
      connectedAt: s.expiry ? (s.expiry - 604800) * 1000 : Date.now(), // approx
    }));
    setSessions(list);
  }

  const pair = useCallback(async (uri: string) => {
    const wallet = web3walletRef.current;
    if (!wallet) throw new Error('WalletConnect not initialized');
    await wallet.pair({ uri });
  }, []);

  const disconnect = useCallback(async (topic: string) => {
    const wallet = web3walletRef.current;
    if (!wallet) return;
    await wallet.disconnectSession({ topic, reason: { code: 6000, message: 'User disconnected' } });
    refreshSessions(wallet);
  }, []);

  const value: WalletConnectContextValue = {
    initialized,
    sessions,
    pair,
    disconnect,
  };

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
    </WalletConnectContext.Provider>
  );
}
