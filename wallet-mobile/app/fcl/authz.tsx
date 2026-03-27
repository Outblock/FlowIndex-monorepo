import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useWallet } from '@flowindex/wallet-core';
import { encodeMessageFromSignable, signFlowTransaction } from '@flowindex/flow-passkey';
import { usePendingRequests } from '../../stores/pending-requests';
import { useMobileAuth } from '../../providers/AuthProvider';

const RP_ID = process.env.EXPO_PUBLIC_RP_ID || 'flowindex.io';

/** Decode a base64url string to a UTF-8 string */
function base64UrlDecode(input: string): string {
  // Convert base64url to base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  return atob(padded);
}

export default function FclAuthzScreen() {
  const router = useRouter();
  const { callback, signable: signableB64 } = useLocalSearchParams<{
    callback: string;
    signable: string;
  }>();

  const { activeAccount, network } = useWallet();
  const { add } = usePendingRequests();
  const { passkeys } = useMobileAuth();

  useEffect(() => {
    if (!callback || !signableB64) {
      router.back();
      return;
    }

    let signable: any;
    try {
      signable = JSON.parse(base64UrlDecode(signableB64));
    } catch {
      Linking.openURL(`${callback}?fclError=invalid_signable`);
      router.back();
      return;
    }

    const flowAddress = network === 'testnet'
      ? activeAccount?.flowAddressTestnet
      : activeAccount?.flowAddress;

    const credentialId = activeAccount?.credentialId ?? passkeys[0]?.credentialId ?? '';

    const requestId = `authz-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const onApprove = async () => {
      if (!flowAddress || !credentialId) {
        throw new Error('No active account or credential');
      }

      const addr = flowAddress.replace(/^0x/, '');
      const messageHex = encodeMessageFromSignable(signable, addr);
      const { signature, extensionData } = await signFlowTransaction({
        messageHex,
        credentialId,
        rpId: RP_ID,
      });

      const compositeSignature = {
        f_type: 'CompositeSignature',
        f_vsn: '1.0.0',
        addr: `0x${addr}`,
        keyId: 0,
        signature,
        extensionData,
      };

      const encoded = Buffer.from(JSON.stringify(compositeSignature)).toString('base64');
      Linking.openURL(`${callback}?fclResponse=${encodeURIComponent(encoded)}`);
    };

    const onReject = () => {
      Linking.openURL(`${callback}?fclError=user_rejected`);
    };

    // Determine dApp info from signable if available
    const voucher = signable?.voucher ?? signable;
    const cadenceScript: string = voucher?.cadence ?? '';

    add({
      id: requestId,
      type: 'fcl_authz',
      dapp: {
        name: signable?.message ? 'dApp' : 'dApp',
        url: callback,
        icon: undefined,
      },
      payload: {
        onApprove,
        onReject,
        cadence: cadenceScript,
      },
      callback,
      chainType: 'cadence',
      method: 'authz',
      createdAt: Date.now(),
    });

    router.replace(`/approve/${requestId}`);
  }, []);

  // Render nothing — this is purely a routing shim
  return null;
}
