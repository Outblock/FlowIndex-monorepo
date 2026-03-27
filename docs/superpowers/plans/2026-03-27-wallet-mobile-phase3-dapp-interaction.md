# Wallet Mobile Phase 3: dApp Interaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable wallet-mobile to interact with both Flow Cadence dApps (via FCL universal links) and Flow EVM dApps (via WalletConnect v2), with shared approval UI and passkey-based signing.

**Architecture:** Universal links on `wallet.flowindex.io` route FCL authn/authz/sign requests to Expo Router screens. WalletConnect v2 SDK (`@walletconnect/web3wallet`) handles EVM dApp sessions. Both channels write to a shared pending request store, which feeds into common approve/sign modal screens. Cadence signing uses `flow-passkey`, EVM signing uses `evm-wallet` with passkey-backed smart wallet.

**Tech Stack:** Expo Router deep linking, @walletconnect/web3wallet, @walletconnect/react-native-compat, zustand (pending request store), expo-camera (QR scanner), flow-passkey, evm-wallet (viem)

**Spec:** `docs/superpowers/specs/2026-03-27-wallet-mobile-phase3-dapp-interaction-design.md`

---

## File Map

### New in `packages/wallet-core/src/fcl/`

| File | Responsibility |
|------|---------------|
| `types.ts` | FCL types — FclService, FclAuthnResponse, FclSignable (from wallet/src/fcl/types.ts) |
| `services.ts` | buildAuthnResponse() for deep link callback (from wallet/src/fcl/services.ts) |
| `index.ts` | Barrel export |

### New in `packages/evm-wallet/src/`

| File | Responsibility |
|------|---------------|
| `smart-wallet-signing.ts` | signMessageWithPasskey, signTypedDataWithPasskey, sendTransactionWithPasskey — extracted from dev-wallet |

### New in `wallet-mobile/`

| File | Responsibility |
|------|---------------|
| `stores/pending-requests.ts` | Zustand store for pending FCL + WC requests |
| `providers/WalletConnectProvider.tsx` | Web3Wallet init, session/request event listeners |
| `app/approve/[id].tsx` | Transaction approval modal |
| `app/sign/[id].tsx` | Message signing modal |
| `app/fcl/_layout.tsx` | FCL route group (modal presentation) |
| `app/fcl/authn.tsx` | FCL authentication handler |
| `app/fcl/authz.tsx` | FCL transaction authorization handler |
| `app/fcl/sign.tsx` | FCL message signing handler |
| `app/wc/index.tsx` | WalletConnect pairing handler (deep link entry) |
| `app/wc/scan.tsx` | QR code scanner |
| `app/(tabs)/connect.tsx` | WC sessions list + scan button |

### Modified

| File | Change |
|------|--------|
| `wallet-mobile/app.config.ts` | Add `applinks:wallet.flowindex.io` to associatedDomains |
| `wallet-mobile/app/(tabs)/_layout.tsx` | Add 5th "Connect" tab |
| `wallet-mobile/providers/index.tsx` | Add WalletConnectProvider to provider stack |
| `wallet-mobile/app/_layout.tsx` | Add modal routes for approve/sign/fcl/wc |
| `packages/evm-wallet/package.json` | Add @flowindex/flow-passkey peer dep |
| `packages/wallet-core/src/index.ts` | Export fcl module |

---

## Task 1: Deep Link Infrastructure

**Files:**
- Modify: `wallet-mobile/app.config.ts`
- Create: `wallet-mobile/well-known/wallet-apple-app-site-association`

- [ ] **Step 1: Add applinks to app.config.ts**

In `wallet-mobile/app.config.ts`, find the `associatedDomains` array and add the applinks entry:

```typescript
associatedDomains: [
  'webcredentials:flowindex.io',
  'applinks:wallet.flowindex.io',
],
```

- [ ] **Step 2: Create apple-app-site-association for wallet.flowindex.io**

Create `wallet-mobile/well-known/wallet-apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "444MY26W7F.io.flowindex.wallet",
        "paths": ["/fcl/*", "/wc"]
      }
    ]
  }
}
```

This file needs to be deployed to `wallet.flowindex.io/.well-known/apple-app-site-association` (via Caddy config on the frontend VM). The deployment is an infra step done separately.

- [ ] **Step 3: Commit**

```bash
git add wallet-mobile/app.config.ts wallet-mobile/well-known/
git commit -m "feat(wallet-mobile): add universal link config for wallet.flowindex.io"
```

---

## Task 2: Pending Request Store

**Files:**
- Create: `wallet-mobile/stores/pending-requests.ts`

- [ ] **Step 1: Create the store**

Create `wallet-mobile/stores/pending-requests.ts`:

```typescript
import { create } from 'zustand';

export type RequestType =
  | 'fcl_authn'
  | 'fcl_authz'
  | 'fcl_sign'
  | 'wc_session'
  | 'wc_request';

export interface DappInfo {
  name: string;
  url: string;
  icon?: string;
}

export interface PendingRequest {
  id: string;
  type: RequestType;
  dapp: DappInfo;
  payload: any;
  callback: string;
  chainType: 'cadence' | 'evm';
  method?: string;
  createdAt: number;
}

interface PendingRequestStore {
  requests: Map<string, PendingRequest>;
  add: (request: PendingRequest) => void;
  remove: (id: string) => void;
  get: (id: string) => PendingRequest | undefined;
}

export const usePendingRequests = create<PendingRequestStore>((set, get) => ({
  requests: new Map(),
  add: (request) =>
    set((state) => {
      const next = new Map(state.requests);
      next.set(request.id, request);
      return { requests: next };
    }),
  remove: (id) =>
    set((state) => {
      const next = new Map(state.requests);
      next.delete(id);
      return { requests: next };
    }),
  get: (id) => get().requests.get(id),
}));
```

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/stores/
git commit -m "feat(wallet-mobile): add pending request store for dApp interactions"
```

---

## Task 3: FCL Types + Response Builder in wallet-core

**Files:**
- Create: `packages/wallet-core/src/fcl/types.ts`
- Create: `packages/wallet-core/src/fcl/services.ts`
- Create: `packages/wallet-core/src/fcl/index.ts`
- Modify: `packages/wallet-core/src/index.ts`

- [ ] **Step 1: Create FCL types**

Create `packages/wallet-core/src/fcl/types.ts`:

```typescript
export interface FclService {
  f_type: 'Service';
  f_vsn: '1.0.0';
  type: 'authn' | 'authz' | 'user-signature' | 'pre-authz' | 'account-proof';
  uid: string;
  method?: 'POP/RPC' | 'HTTP/POST' | 'EXT/RPC';
  endpoint?: string;
  identity?: { address: string; keyId: number };
  provider?: { address: string; name: string; icon?: string; description?: string };
  data?: Record<string, unknown>;
}

export interface FclAuthnResponse {
  f_type: 'AuthnResponse';
  f_vsn: '1.0.0';
  addr: string;
  paddr?: string | null;
  network?: string;
  services: FclService[];
}
```

- [ ] **Step 2: Create FCL services builder**

Create `packages/wallet-core/src/fcl/services.ts`:

```typescript
import type { FclAuthnResponse, FclService } from './types';

export interface BuildAuthnResponseOptions {
  address: string;
  keyId: number;
  /** Base URL for authz/sign endpoints (e.g. 'https://wallet.flowindex.io/fcl') */
  baseUrl: string;
  network?: string;
}

/**
 * Build an FCL AuthnResponse for deep-link-based wallet interaction.
 * Services point to universal link URLs that the mobile app handles.
 */
export function buildAuthnResponse(options: BuildAuthnResponseOptions): FclAuthnResponse {
  const { address, keyId, baseUrl, network } = options;
  const addr = address.startsWith('0x') ? address.slice(2) : address;
  const fullAddr = `0x${addr}`;

  const authnService: FclService = {
    f_type: 'Service',
    f_vsn: '1.0.0',
    type: 'authn',
    uid: 'flowindex-wallet#authn',
    method: 'POP/RPC',
    identity: { address: fullAddr, keyId },
    provider: {
      address: fullAddr,
      name: 'FlowIndex Wallet',
      icon: 'https://flowindex.io/logo.png',
      description: 'FlowIndex non-custodial wallet',
    },
  };

  const authzService: FclService = {
    f_type: 'Service',
    f_vsn: '1.0.0',
    type: 'authz',
    uid: 'flowindex-wallet#authz',
    method: 'HTTP/POST',
    endpoint: `${baseUrl}/authz`,
    identity: { address: fullAddr, keyId },
  };

  const userSigService: FclService = {
    f_type: 'Service',
    f_vsn: '1.0.0',
    type: 'user-signature',
    uid: 'flowindex-wallet#user-signature',
    method: 'HTTP/POST',
    endpoint: `${baseUrl}/sign`,
    identity: { address: fullAddr, keyId },
  };

  return {
    f_type: 'AuthnResponse',
    f_vsn: '1.0.0',
    addr: fullAddr,
    paddr: null,
    network,
    services: [authnService, authzService, userSigService],
  };
}
```

- [ ] **Step 3: Create barrel export**

Create `packages/wallet-core/src/fcl/index.ts`:

```typescript
export { buildAuthnResponse } from './services';
export type { BuildAuthnResponseOptions } from './services';
export type { FclService, FclAuthnResponse } from './types';
```

- [ ] **Step 4: Update wallet-core index.ts**

Add to `packages/wallet-core/src/index.ts`:

```typescript
export * from './fcl/index';
```

- [ ] **Step 5: Build and verify**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add packages/wallet-core/
git commit -m "feat(wallet-core): add FCL types and authn response builder for deep links"
```

---

## Task 4: Approval UI — approve/[id].tsx + sign/[id].tsx

**Files:**
- Create: `wallet-mobile/app/approve/[id].tsx`
- Create: `wallet-mobile/app/sign/[id].tsx`

- [ ] **Step 1: Create transaction approval screen**

Create `wallet-mobile/app/approve/[id].tsx`:

```tsx
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { usePendingRequests } from '../../stores/pending-requests';
import { Fingerprint, X, Globe, Code } from 'lucide-react-native';

export default function ApproveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const request = usePendingRequests((s) => s.get(id!));
  const removeRequest = usePendingRequests((s) => s.remove);
  const [signing, setSigning] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!request) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa' }}>Request not found</Text>
      </SafeAreaView>
    );
  }

  const handleApprove = async () => {
    setSigning(true);
    try {
      // The actual signing is done by the caller who set request.payload.onApprove
      if (request.payload.onApprove) {
        await request.payload.onApprove();
      }
    } finally {
      setSigning(false);
      removeRequest(request.id);
      router.back();
    }
  };

  const handleReject = () => {
    if (request.payload.onReject) {
      request.payload.onReject();
    }
    removeRequest(request.id);
    router.back();
  };

  const scriptPreview = request.payload.cadence ?? request.payload.data ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Approve Transaction</Text>
          <Pressable onPress={handleReject}><X size={24} color="#a1a1aa" /></Pressable>
        </View>

        {/* dApp info */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
          backgroundColor: '#1a1a1a', borderRadius: 12, marginBottom: 16,
        }}>
          {request.dapp.icon ? (
            <Image source={{ uri: request.dapp.icon }} style={{ width: 40, height: 40, borderRadius: 8 }} />
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={20} color="#a1a1aa" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{request.dapp.name}</Text>
            <Text style={{ color: '#a1a1aa', fontSize: 13 }}>{request.dapp.url}</Text>
          </View>
          <View style={{
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
            backgroundColor: request.chainType === 'cadence' ? '#00ef8b20' : '#6366f120',
          }}>
            <Text style={{ color: request.chainType === 'cadence' ? '#00ef8b' : '#6366f1', fontSize: 11, fontWeight: '600' }}>
              {request.chainType === 'cadence' ? 'Cadence' : 'EVM'}
            </Text>
          </View>
        </View>

        {/* Script / Data preview */}
        {scriptPreview ? (
          <Pressable
            onPress={() => setExpanded(!expanded)}
            style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 16 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: expanded ? 12 : 0 }}>
              <Code size={16} color="#a1a1aa" />
              <Text style={{ color: '#a1a1aa', fontSize: 13 }}>
                {expanded ? 'Transaction Details' : 'Tap to view details'}
              </Text>
            </View>
            {expanded && (
              <Text style={{ color: '#71717a', fontSize: 12, fontFamily: 'monospace' }} numberOfLines={20}>
                {typeof scriptPreview === 'string' ? scriptPreview : JSON.stringify(scriptPreview, null, 2)}
              </Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Action buttons */}
      <View style={{ padding: 16, gap: 12 }}>
        {signing ? (
          <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
            <ActivityIndicator color="#00ef8b" />
            <Text style={{ color: '#a1a1aa', fontSize: 14 }}>Signing with passkey...</Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={handleApprove}
              style={{
                backgroundColor: '#00ef8b', borderRadius: 12, paddingVertical: 16,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Fingerprint size={20} color="#000" />
              <Text style={{ color: '#000', fontSize: 17, fontWeight: '600' }}>Approve</Text>
            </Pressable>
            <Pressable
              onPress={handleReject}
              style={{
                backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 16,
                alignItems: 'center', borderWidth: 1, borderColor: '#27272a',
              }}
            >
              <Text style={{ color: '#a1a1aa', fontSize: 17, fontWeight: '600' }}>Reject</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Create message signing screen**

Create `wallet-mobile/app/sign/[id].tsx`:

```tsx
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { usePendingRequests } from '../../stores/pending-requests';
import { Fingerprint, X, Globe } from 'lucide-react-native';

function tryDecodeHex(hex: string): string {
  try {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const text = new TextDecoder().decode(bytes);
    // Check if it's printable
    if (/^[\x20-\x7E\n\r\t]+$/.test(text)) return text;
    return hex;
  } catch {
    return hex;
  }
}

export default function SignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const request = usePendingRequests((s) => s.get(id!));
  const removeRequest = usePendingRequests((s) => s.remove);
  const [signing, setSigning] = useState(false);

  const displayMessage = useMemo(() => {
    if (!request) return '';
    const msg = request.payload.message ?? request.payload.data ?? '';
    if (typeof msg === 'string') return tryDecodeHex(msg);
    return JSON.stringify(msg, null, 2);
  }, [request]);

  if (!request) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa' }}>Request not found</Text>
      </SafeAreaView>
    );
  }

  const handleApprove = async () => {
    setSigning(true);
    try {
      if (request.payload.onApprove) {
        await request.payload.onApprove();
      }
    } finally {
      setSigning(false);
      removeRequest(request.id);
      router.back();
    }
  };

  const handleReject = () => {
    if (request.payload.onReject) {
      request.payload.onReject();
    }
    removeRequest(request.id);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Sign Message</Text>
          <Pressable onPress={handleReject}><X size={24} color="#a1a1aa" /></Pressable>
        </View>

        {/* dApp info */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
          backgroundColor: '#1a1a1a', borderRadius: 12, marginBottom: 16,
        }}>
          {request.dapp.icon ? (
            <Image source={{ uri: request.dapp.icon }} style={{ width: 40, height: 40, borderRadius: 8 }} />
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={20} color="#a1a1aa" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{request.dapp.name}</Text>
            <Text style={{ color: '#a1a1aa', fontSize: 13 }}>{request.dapp.url}</Text>
          </View>
        </View>

        {/* Message content */}
        <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16 }}>
          <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 8 }}>Message</Text>
          <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'monospace', lineHeight: 20 }}>
            {displayMessage}
          </Text>
        </View>
      </ScrollView>

      {/* Action buttons */}
      <View style={{ padding: 16, gap: 12 }}>
        {signing ? (
          <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
            <ActivityIndicator color="#00ef8b" />
            <Text style={{ color: '#a1a1aa', fontSize: 14 }}>Signing with passkey...</Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={handleApprove}
              style={{
                backgroundColor: '#00ef8b', borderRadius: 12, paddingVertical: 16,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Fingerprint size={20} color="#000" />
              <Text style={{ color: '#000', fontSize: 17, fontWeight: '600' }}>Sign</Text>
            </Pressable>
            <Pressable
              onPress={handleReject}
              style={{
                backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 16,
                alignItems: 'center', borderWidth: 1, borderColor: '#27272a',
              }}
            >
              <Text style={{ color: '#a1a1aa', fontSize: 17, fontWeight: '600' }}>Reject</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add wallet-mobile/app/approve/ wallet-mobile/app/sign/
git commit -m "feat(wallet-mobile): add shared approval and signing UI screens"
```

---

## Task 5: FCL Deep Link Routes

**Files:**
- Create: `wallet-mobile/app/fcl/_layout.tsx`
- Create: `wallet-mobile/app/fcl/authn.tsx`
- Create: `wallet-mobile/app/fcl/authz.tsx`
- Create: `wallet-mobile/app/fcl/sign.tsx`

- [ ] **Step 1: Create FCL layout**

Create `wallet-mobile/app/fcl/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function FclLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal',
        contentStyle: { backgroundColor: '#0a0a0a' },
      }}
    />
  );
}
```

- [ ] **Step 2: Create FCL authn handler**

Create `wallet-mobile/app/fcl/authn.tsx`:

```tsx
import { View, Text, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWallet, buildAuthnResponse } from '@flowindex/wallet-core';
import { Globe, Check, X } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { bytesToBase64Url } from '@flowindex/flow-passkey';

export default function FclAuthnScreen() {
  const params = useLocalSearchParams<{
    callback: string;
    nonce?: string;
    appName?: string;
    appIcon?: string;
  }>();
  const { activeAccount, network } = useWallet();
  const router = useRouter();
  const address = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;
  const displayAddress = address ? `0x${address}` : '';

  const handleApprove = async () => {
    if (!address || !params.callback) return;

    const response = buildAuthnResponse({
      address: displayAddress,
      keyId: 0,
      baseUrl: 'https://wallet.flowindex.io/fcl',
      network,
    });

    const encoded = btoa(JSON.stringify(response));
    const separator = params.callback.includes('?') ? '&' : '?';
    const redirectUrl = `${params.callback}${separator}fclResponse=${encodeURIComponent(encoded)}`;
    await Linking.openURL(redirectUrl);
    router.back();
  };

  const handleReject = () => {
    if (params.callback) {
      const separator = params.callback.includes('?') ? '&' : '?';
      Linking.openURL(`${params.callback}${separator}fclError=user_rejected`);
    }
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        {/* dApp info */}
        <View style={{
          width: 64, height: 64, borderRadius: 16, backgroundColor: '#1a1a1a',
          alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        }}>
          {params.appIcon ? (
            <Image source={{ uri: params.appIcon }} style={{ width: 48, height: 48, borderRadius: 12 }} />
          ) : (
            <Globe size={28} color="#a1a1aa" />
          )}
        </View>

        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
          Connect to {params.appName ?? 'dApp'}?
        </Text>
        <Text style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 32, textAlign: 'center' }}>
          This app wants to view your Flow address
        </Text>

        {/* Account info */}
        <View style={{
          backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, width: '100%', marginBottom: 32,
        }}>
          <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 4 }}>Account</Text>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
            {activeAccount?.authenticatorName ?? 'Wallet'}
          </Text>
          <Text style={{ color: '#a1a1aa', fontSize: 13, fontFamily: 'monospace', marginTop: 4 }}>
            {displayAddress}
          </Text>
        </View>

        {/* Buttons */}
        <View style={{ width: '100%', gap: 12 }}>
          <Pressable
            onPress={handleApprove}
            style={{
              backgroundColor: '#00ef8b', borderRadius: 12, paddingVertical: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Check size={20} color="#000" />
            <Text style={{ color: '#000', fontSize: 17, fontWeight: '600' }}>Connect</Text>
          </Pressable>
          <Pressable
            onPress={handleReject}
            style={{
              backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 16,
              alignItems: 'center', borderWidth: 1, borderColor: '#27272a',
            }}
          >
            <Text style={{ color: '#a1a1aa', fontSize: 17, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Create FCL authz handler**

Create `wallet-mobile/app/fcl/authz.tsx`:

```tsx
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWallet } from '@flowindex/wallet-core';
import { signFlowTransaction, encodeMessageFromSignable } from '@flowindex/flow-passkey';
import { usePendingRequests } from '../../stores/pending-requests';
import * as Linking from 'expo-linking';

export default function FclAuthzScreen() {
  const params = useLocalSearchParams<{ callback: string; signable: string }>();
  const { activeAccount, network } = useWallet();
  const router = useRouter();
  const addRequest = usePendingRequests((s) => s.add);

  useEffect(() => {
    if (!params.signable || !params.callback || !activeAccount) return;

    const signable = JSON.parse(atob(decodeURIComponent(params.signable)));
    const address = network === 'testnet' ? activeAccount.flowAddressTestnet : activeAccount.flowAddress;
    if (!address) return;

    const requestId = `fcl_authz_${Date.now()}`;

    const onApprove = async () => {
      const messageHex = encodeMessageFromSignable(signable, address);
      const result = await signFlowTransaction({
        messageHex,
        credentialId: activeAccount.credentialId,
        rpId: 'flowindex.io',
      });

      const responseData = {
        f_type: 'CompositeSignature',
        f_vsn: '1.0.0',
        addr: `0x${address}`,
        keyId: 0,
        signature: result.signature,
        extensionData: result.extensionData,
      };

      const encoded = btoa(JSON.stringify(responseData));
      const separator = params.callback!.includes('?') ? '&' : '?';
      await Linking.openURL(`${params.callback}${separator}fclResponse=${encodeURIComponent(encoded)}`);
    };

    const onReject = () => {
      const separator = params.callback!.includes('?') ? '&' : '?';
      Linking.openURL(`${params.callback}${separator}fclError=user_rejected`);
    };

    addRequest({
      id: requestId,
      type: 'fcl_authz',
      dapp: { name: signable.voucher?.cadence?.slice(0, 30) ?? 'dApp', url: params.callback! },
      payload: { cadence: signable.voucher?.cadence, onApprove, onReject },
      callback: params.callback!,
      chainType: 'cadence',
      createdAt: Date.now(),
    });

    router.replace(`/approve/${requestId}`);
  }, []);

  return null;
}
```

- [ ] **Step 4: Create FCL sign handler**

Create `wallet-mobile/app/fcl/sign.tsx`:

```tsx
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWallet } from '@flowindex/wallet-core';
import { signFlowTransaction, hexToBytes, bytesToHex } from '@flowindex/flow-passkey';
import { usePendingRequests } from '../../stores/pending-requests';
import * as Linking from 'expo-linking';

const USER_DOMAIN_TAG = '464c4f572d56302e302d75736572000000000000000000000000000000000000'; // "FLOW-V0.0-user" padded to 32 bytes

export default function FclSignScreen() {
  const params = useLocalSearchParams<{ callback: string; message: string }>();
  const { activeAccount, network } = useWallet();
  const router = useRouter();
  const addRequest = usePendingRequests((s) => s.add);

  useEffect(() => {
    if (!params.message || !params.callback || !activeAccount) return;

    const address = network === 'testnet' ? activeAccount.flowAddressTestnet : activeAccount.flowAddress;
    if (!address) return;

    const requestId = `fcl_sign_${Date.now()}`;
    const messageHex = params.message.startsWith('0x') ? params.message.slice(2) : params.message;

    const onApprove = async () => {
      // Prepend user domain tag
      const taggedMessage = USER_DOMAIN_TAG + messageHex;
      const result = await signFlowTransaction({
        messageHex: taggedMessage,
        credentialId: activeAccount.credentialId,
        rpId: 'flowindex.io',
      });

      const responseData = {
        f_type: 'CompositeSignature',
        f_vsn: '1.0.0',
        addr: `0x${address}`,
        keyId: 0,
        signature: result.signature,
        extensionData: result.extensionData,
      };

      const encoded = btoa(JSON.stringify(responseData));
      const separator = params.callback!.includes('?') ? '&' : '?';
      await Linking.openURL(`${params.callback}${separator}fclResponse=${encodeURIComponent(encoded)}`);
    };

    const onReject = () => {
      const separator = params.callback!.includes('?') ? '&' : '?';
      Linking.openURL(`${params.callback}${separator}fclError=user_rejected`);
    };

    addRequest({
      id: requestId,
      type: 'fcl_sign',
      dapp: { name: 'dApp', url: params.callback! },
      payload: { message: messageHex, onApprove, onReject },
      callback: params.callback!,
      chainType: 'cadence',
      createdAt: Date.now(),
    });

    router.replace(`/sign/${requestId}`);
  }, []);

  return null;
}
```

- [ ] **Step 5: Commit**

```bash
git add wallet-mobile/app/fcl/
git commit -m "feat(wallet-mobile): add FCL deep link handlers for authn, authz, and sign"
```

---

## Task 6: EVM Smart Wallet Signing Extraction

**Files:**
- Create: `packages/evm-wallet/src/smart-wallet-signing.ts`
- Modify: `packages/evm-wallet/src/index.ts`
- Modify: `packages/evm-wallet/package.json`

- [ ] **Step 1: Create smart-wallet-signing.ts**

This extracts the key signing functions from `~/outblock/passkey/utils/smartWallet.ts` into the shared `evm-wallet` package. Read the full file at `/Users/hao/outblock/passkey/utils/smartWallet.ts` and extract:

- `signMessageWithPasskey(messageHex, credentialId, smartWalletAddress, network)` → Hex signature
- `signTypedDataWithPasskey(typedData, credentialId, smartWalletAddress, network)` → Hex signature
- `sendTransactionWithPasskey(tx, credentialId, smartWalletAddress, network)` → tx hash

These functions should:
- Import `getPasskeyAssertion` from `@flowindex/flow-passkey` for WebAuthn signing
- Import constants (ENTRYPOINT, FACTORY, PAYMASTER addresses) from `./constants`
- Import UserOp helpers from `./user-op`
- Import bundler client from `./bundler-client`
- Use `viem` for encoding/hashing

**IMPORTANT:** The implementer MUST read the full `smartWallet.ts` file (~888 lines) to understand the exact signing logic. The key patterns are:
- Message signing: hash message → `replaySafeHash(smartWalletAddress, hash)` → WebAuthn assertion → encode as CoinbaseSmartWallet signature format
- Typed data signing: similar but uses `hashTypedData()` from viem
- Transaction: build UserOp → compute UserOp hash → WebAuthn assertion → encode signature → submit to bundler

Create the file with the extracted functions, adapting network-to-URL resolution to use the existing `getBundlerUrl()` / `getPaymasterUrl()` helpers from `./constants`.

- [ ] **Step 2: Update evm-wallet index.ts**

Add to `packages/evm-wallet/src/index.ts`:

```typescript
export { signMessageWithPasskey, signTypedDataWithPasskey, sendTransactionWithPasskey } from './smart-wallet-signing';
```

- [ ] **Step 3: Add flow-passkey as peer dependency**

In `packages/evm-wallet/package.json`, add:

```json
"peerDependencies": {
  "@flowindex/flow-passkey": ">=0.1.0",
  "@walletconnect/core": "^2.18.0",
  "@walletconnect/web3wallet": "^1.17.0"
},
"peerDependenciesMeta": {
  "@flowindex/flow-passkey": { "optional": true },
  "@walletconnect/core": { "optional": true },
  "@walletconnect/web3wallet": { "optional": true }
}
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/evm-wallet && bun run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add packages/evm-wallet/
git commit -m "feat(evm-wallet): extract passkey-based smart wallet signing from dev-wallet"
```

---

## Task 7: WalletConnect Provider

**Files:**
- Create: `wallet-mobile/providers/WalletConnectProvider.tsx`
- Modify: `wallet-mobile/providers/index.tsx`
- Modify: `wallet-mobile/package.json`

- [ ] **Step 1: Install WalletConnect dependencies**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile
bun add @walletconnect/web3wallet @walletconnect/core @walletconnect/react-native-compat
```

- [ ] **Step 2: Create WalletConnectProvider**

Create `wallet-mobile/providers/WalletConnectProvider.tsx`:

```tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useWallet } from '@flowindex/wallet-core';
import { usePendingRequests } from '../stores/pending-requests';
import type { Web3Wallet as Web3WalletType } from '@walletconnect/web3wallet';

const WC_PROJECT_ID = '39d7c0c723726953bc312950113463b4';

interface WCSession {
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

const WalletConnectContext = createContext<WalletConnectContextValue>({
  initialized: false,
  sessions: [],
  pair: async () => {},
  disconnect: async () => {},
});

export function WalletConnectProvider({ children }: { children: React.ReactNode }) {
  const walletRef = useRef<Web3WalletType | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sessions, setSessions] = useState<WCSession[]>([]);
  const { activeAccount, network, evmAddress } = useWallet();
  const addRequest = usePendingRequests((s) => s.add);
  const router = useRouter();

  // Lazy init — only load WC SDK when needed
  const getWallet = useCallback(async (): Promise<Web3WalletType> => {
    if (walletRef.current) return walletRef.current;

    // Dynamic import to avoid loading heavy WC deps at startup
    const { Core } = await import('@walletconnect/core');
    const { Web3Wallet } = await import('@walletconnect/web3wallet');

    const core = new Core({ projectId: WC_PROJECT_ID });
    const wallet = await Web3Wallet.init({
      core,
      metadata: {
        name: 'FlowIndex Wallet',
        description: 'Non-custodial Flow wallet',
        url: 'https://wallet.flowindex.io',
        icons: ['https://flowindex.io/logo.png'],
        redirect: {
          native: 'flowindex-wallet://',
          universal: 'https://wallet.flowindex.io',
        },
      },
    });

    // Session proposal handler
    wallet.on('session_proposal', async (proposal) => {
      const requestId = `wc_session_${Date.now()}`;
      const peer = proposal.params.proposer.metadata;

      const onApprove = async () => {
        if (!evmAddress) throw new Error('No EVM address');
        const chainId = network === 'testnet' ? 545 : 747;
        const namespaces = {
          eip155: {
            chains: [`eip155:${chainId}`],
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            events: ['chainChanged', 'accountsChanged'],
            accounts: [`eip155:${chainId}:${evmAddress}`],
          },
        };
        await wallet.approveSession({ id: proposal.id, namespaces });
        refreshSessions(wallet);
      };

      const onReject = async () => {
        await wallet.rejectSession({
          id: proposal.id,
          reason: { code: 4001, message: 'User rejected' },
        });
      };

      addRequest({
        id: requestId,
        type: 'wc_session',
        dapp: { name: peer.name, url: peer.url, icon: peer.icons?.[0] },
        payload: { proposal, onApprove, onReject },
        callback: '',
        chainType: 'evm',
        createdAt: Date.now(),
      });

      router.push(`/approve/${requestId}`);
    });

    // Session request handler
    wallet.on('session_request', async (event) => {
      const { topic, id: wcRequestId, params } = event;
      const session = wallet.getActiveSessions()[topic];
      const peer = session?.peer?.metadata;
      const requestId = `wc_req_${Date.now()}`;

      const isSignRequest = ['personal_sign', 'eth_signTypedData_v4'].includes(params.request.method);

      const onApprove = async () => {
        // Signing logic will be wired in Task 9
        // For now, placeholder that will be replaced
        const result = '0x'; // TODO: implement in Task 9
        await wallet.respondSessionRequest({ topic, response: { id: wcRequestId, jsonrpc: '2.0', result } });
      };

      const onReject = async () => {
        await wallet.respondSessionRequest({
          topic,
          response: { id: wcRequestId, jsonrpc: '2.0', error: { code: 4001, message: 'User rejected' } },
        });
      };

      addRequest({
        id: requestId,
        type: 'wc_request',
        dapp: { name: peer?.name ?? 'dApp', url: peer?.url ?? '', icon: peer?.icons?.[0] },
        payload: { method: params.request.method, params: params.request.params, wcTopic: topic, wcRequestId, onApprove, onReject },
        callback: topic,
        chainType: 'evm',
        method: params.request.method,
        createdAt: Date.now(),
      });

      router.push(isSignRequest ? `/sign/${requestId}` : `/approve/${requestId}`);
    });

    walletRef.current = wallet;
    setInitialized(true);
    refreshSessions(wallet);
    return wallet;
  }, [evmAddress, network, addRequest, router]);

  const refreshSessions = (wallet: Web3WalletType) => {
    const active = wallet.getActiveSessions();
    const list: WCSession[] = Object.entries(active).map(([topic, session]) => ({
      topic,
      peerName: session.peer.metadata.name,
      peerUrl: session.peer.metadata.url,
      peerIcon: session.peer.metadata.icons?.[0],
      chains: session.namespaces?.eip155?.chains ?? [],
      connectedAt: Date.now(),
    }));
    setSessions(list);
  };

  const pair = useCallback(async (uri: string) => {
    const wallet = await getWallet();
    await wallet.pair({ uri });
  }, [getWallet]);

  const disconnect = useCallback(async (topic: string) => {
    const wallet = await getWallet();
    await wallet.disconnectSession({ topic, reason: { code: 6000, message: 'User disconnected' } });
    refreshSessions(wallet);
  }, [getWallet]);

  return (
    <WalletConnectContext.Provider value={{ initialized, sessions, pair, disconnect }}>
      {children}
    </WalletConnectContext.Provider>
  );
}

export function useWalletConnect() {
  return useContext(WalletConnectContext);
}
```

- [ ] **Step 3: Update providers/index.tsx**

Add WalletConnectProvider to the provider stack in `wallet-mobile/providers/index.tsx`. Wrap children with `<WalletConnectProvider>` inside `WalletProviderMobile` (WC needs wallet context):

```tsx
import { WalletConnectProvider } from './WalletConnectProvider';

// In AppProviders, wrap the innermost children:
export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureApiClient({ baseUrl: API_BASE_URL });
  }, []);

  return (
    <MobileAuthProvider>
      <WalletBridge>
        <WalletConnectProvider>
          {children}
        </WalletConnectProvider>
      </WalletBridge>
    </MobileAuthProvider>
  );
}

export { useAuth } from './AuthProvider';
export { useWalletConnect } from './WalletConnectProvider';
```

- [ ] **Step 4: Commit**

```bash
git add wallet-mobile/providers/ wallet-mobile/package.json
git commit -m "feat(wallet-mobile): add WalletConnect v2 provider with session management"
```

---

## Task 8: WC Pairing Route + QR Scanner

**Files:**
- Create: `wallet-mobile/app/wc/index.tsx`
- Create: `wallet-mobile/app/wc/scan.tsx`

- [ ] **Step 1: Create WC pairing handler**

Create `wallet-mobile/app/wc/index.tsx`:

```tsx
import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWalletConnect } from '../../providers';

export default function WcPairingScreen() {
  const params = useLocalSearchParams<{ uri: string }>();
  const { pair } = useWalletConnect();
  const router = useRouter();

  useEffect(() => {
    if (!params.uri) { router.back(); return; }

    const decoded = decodeURIComponent(params.uri);
    pair(decoded)
      .catch((err) => console.error('WC pair failed:', err))
      .finally(() => {
        // Session proposal event will navigate to approve screen
        // If no proposal comes within 10s, go back
        setTimeout(() => router.back(), 10000);
      });
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#00ef8b" />
      <Text style={{ color: '#a1a1aa', fontSize: 16, marginTop: 16 }}>Connecting to dApp...</Text>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Create QR scanner**

Create `wallet-mobile/app/wc/scan.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useWalletConnect } from '../../providers';
import { ArrowLeft } from 'lucide-react-native';

export default function WcScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { pair } = useWalletConnect();
  const router = useRouter();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    if (!data.startsWith('wc:')) return;
    setScanned(true);

    try {
      await pair(data);
    } catch (err) {
      console.error('WC pair failed:', err);
    }
    // Session proposal navigates to approve screen
    router.back();
  };

  if (!permission?.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#fff', fontSize: 16, marginBottom: 16, textAlign: 'center' }}>
          Camera permission is needed to scan QR codes
        </Text>
        <Pressable
          onPress={requestPermission}
          style={{ backgroundColor: '#00ef8b', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
        >
          <Text style={{ color: '#000', fontSize: 16, fontWeight: '600' }}>Grant Permission</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      {/* Header overlay */}
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
          <Pressable onPress={() => router.back()}>
            <ArrowLeft size={24} color="#fff" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Scan WalletConnect QR</Text>
        </View>
      </SafeAreaView>
      {/* Center guide */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 250, height: 250, borderWidth: 2, borderColor: '#00ef8b40', borderRadius: 24 }} />
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add wallet-mobile/app/wc/
git commit -m "feat(wallet-mobile): add WalletConnect pairing handler and QR scanner"
```

---

## Task 9: WC Session Request Signing (Wire EVM Signing)

**Files:**
- Modify: `wallet-mobile/providers/WalletConnectProvider.tsx`

- [ ] **Step 1: Wire real EVM signing into WC request handler**

In `wallet-mobile/providers/WalletConnectProvider.tsx`, update the `session_request` handler's `onApprove` to call actual signing functions from `@flowindex/evm-wallet`.

Replace the placeholder `onApprove` in the `session_request` handler with real signing logic. The implementer needs to:

1. Read the `session_request` event's `method` and `params`
2. For `personal_sign`: call `signMessageWithPasskey(messageHex, credentialId, smartWalletAddress, network)` from `@flowindex/evm-wallet`
3. For `eth_signTypedData_v4`: call `signTypedDataWithPasskey(typedData, credentialId, smartWalletAddress, network)` from `@flowindex/evm-wallet`
4. For `eth_sendTransaction`: call `sendTransactionWithPasskey(tx, credentialId, smartWalletAddress, network)` from `@flowindex/evm-wallet`
5. Return the result via `wallet.respondSessionRequest()`

The `credentialId` comes from `activeAccount.credentialId`, `smartWalletAddress` from `evmAddress`, and `network` from wallet context.

**IMPORTANT:** The implementer MUST read `packages/evm-wallet/src/smart-wallet-signing.ts` (created in Task 6) to see the exact function signatures and what parameters they expect.

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/providers/WalletConnectProvider.tsx
git commit -m "feat(wallet-mobile): wire EVM signing into WalletConnect request handler"
```

---

## Task 10: Connect Tab (Sessions List)

**Files:**
- Create: `wallet-mobile/app/(tabs)/connect.tsx`
- Modify: `wallet-mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create Connect tab screen**

Create `wallet-mobile/app/(tabs)/connect.tsx`:

```tsx
import { View, Text, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useWalletConnect } from '../../providers';
import { QrCode, Globe, Unlink, Scan } from 'lucide-react-native';

export default function ConnectScreen() {
  const { sessions, disconnect, initialized } = useWalletConnect();
  const router = useRouter();

  const handleDisconnect = (topic: string, name: string) => {
    Alert.alert('Disconnect', `Disconnect from ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => disconnect(topic) },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Connected dApps</Text>
        <Pressable
          onPress={() => router.push('/wc/scan')}
          style={{
            backgroundColor: '#00ef8b', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
            flexDirection: 'row', alignItems: 'center', gap: 6,
          }}
        >
          <Scan size={16} color="#000" />
          <Text style={{ color: '#000', fontSize: 14, fontWeight: '600' }}>Scan</Text>
        </Pressable>
      </View>

      {sessions.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <QrCode size={48} color="#27272a" />
          <Text style={{ color: '#a1a1aa', fontSize: 16 }}>No active connections</Text>
          <Text style={{ color: '#52525b', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
            Scan a WalletConnect QR code from a dApp to connect
          </Text>
        </View>
      ) : (
        <FlashList
          data={sessions}
          keyExtractor={(item) => item.topic}
          estimatedItemSize={72}
          renderItem={({ item }) => (
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#27272a',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                {item.peerIcon ? (
                  <Image source={{ uri: item.peerIcon }} style={{ width: 40, height: 40, borderRadius: 8 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
                    <Globe size={20} color="#a1a1aa" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>{item.peerName}</Text>
                  <Text style={{ color: '#a1a1aa', fontSize: 13 }}>{item.peerUrl}</Text>
                </View>
              </View>
              <Pressable onPress={() => handleDisconnect(item.topic, item.peerName)}>
                <Unlink size={18} color="#ef4444" />
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Add Connect tab to tab layout**

In `wallet-mobile/app/(tabs)/_layout.tsx`, add a 5th tab for Connect. Add after the Settings tab:

```tsx
<Tabs.Screen
  name="connect"
  options={{
    title: 'Connect',
    tabBarIcon: ({ color, size }) => <Link2 size={size} color={color} />,
  }}
/>
```

Import `Link2` from `lucide-react-native`.

- [ ] **Step 3: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/connect.tsx wallet-mobile/app/\(tabs\)/_layout.tsx
git commit -m "feat(wallet-mobile): add Connect tab with WC sessions list and scan button"
```

---

## Task 11: Update Root Layout + Integration Verification

**Files:**
- Modify: `wallet-mobile/app/_layout.tsx`

- [ ] **Step 1: Add modal routes to root layout**

In `wallet-mobile/app/_layout.tsx`, add the new route groups as modal presentations inside the `<Stack>`:

```tsx
<Stack
  screenOptions={{
    headerShown: false,
    contentStyle: { backgroundColor: '#0a0a0a' },
  }}
>
  <Stack.Screen name="(auth)" />
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="send" options={{ presentation: 'modal' }} />
  <Stack.Screen name="approve" options={{ presentation: 'modal' }} />
  <Stack.Screen name="sign" options={{ presentation: 'modal' }} />
  <Stack.Screen name="fcl" options={{ presentation: 'modal' }} />
  <Stack.Screen name="wc" options={{ presentation: 'modal' }} />
</Stack>
```

- [ ] **Step 2: Install all deps and verify builds**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun install
cd packages/wallet-core && bun run build
cd ../evm-wallet && bun run build
cd ../../wallet && bun run build
```
Expected: All clean builds, no regressions.

- [ ] **Step 3: Verify Expo starts**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && bunx expo start --clear
```
Expected: Metro bundles without errors. App loads with 5 tabs (Home, Activity, NFTs, Settings, Connect).

- [ ] **Step 4: Commit**

```bash
git add wallet-mobile/ packages/
git commit -m "chore: verify phase 3 integration — all packages build, modal routes configured"
```

---

## Summary

After completing all 11 tasks:

1. **Deep link infra** — `wallet.flowindex.io` associated domains configured
2. **Pending request store** — zustand store normalizing FCL + WC requests
3. **FCL types + builder** — extracted to wallet-core for sharing
4. **Approval UI** — shared approve/sign modal screens
5. **FCL deep link routes** — authn, authz, sign handlers
6. **EVM signing extraction** — passkey smart wallet signing in evm-wallet package
7. **WalletConnect provider** — Web3Wallet init, session/request management
8. **WC pairing + QR scanner** — deep link entry + camera scan
9. **WC request signing** — wired to evm-wallet signing functions
10. **Connect tab** — sessions list + disconnect + scan button
11. **Integration verification** — all builds pass, routes configured

**Before real testing:** Deploy `wallet.flowindex.io` Caddy config with `.well-known` files for universal links.

**Next plan:** Phase 4 — In-app dApp browser, FCL WDS registration, seed phrase import, EVM calldata decode.
