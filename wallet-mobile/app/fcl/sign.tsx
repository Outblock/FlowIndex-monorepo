import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useWallet } from '@flowindex/wallet-core';
import { signFlowTransaction } from '@flowindex/flow-passkey';
import { usePendingRequests } from '../../stores/pending-requests';
import { useMobileAuth } from '../../providers/AuthProvider';

function isValidCallback(url: string): boolean {
  return url.startsWith('https://');
}

const RP_ID = process.env.EXPO_PUBLIC_RP_ID || 'flowindex.io';

// USER_DOMAIN_TAG: "FLOW-V0.0-user" right-padded to 32 bytes
const USER_DOMAIN_TAG = '464c4f572d56302e302d75736572000000000000000000000000000000000000';

function prependUserDomainTag(messageHex: string): string {
  const clean = messageHex.replace(/^0x/, '');
  return USER_DOMAIN_TAG + clean;
}

export default function FclSignScreen() {
  const router = useRouter();
  const { callback, message } = useLocalSearchParams<{
    callback: string;
    message: string;
  }>();

  const { activeAccount, network } = useWallet();
  const { add } = usePendingRequests();
  const { passkeys } = useMobileAuth();

  useEffect(() => {
    if (!callback || !message || !activeAccount) {
      router.back();
      return;
    }

    if (!isValidCallback(callback)) {
      Alert.alert('Invalid Callback', 'The callback URL is not a valid HTTPS URL.');
      router.back();
      return;
    }

    const flowAddress = network === 'testnet'
      ? activeAccount?.flowAddressTestnet
      : activeAccount?.flowAddress;

    const credentialId = activeAccount?.credentialId ?? passkeys[0]?.credentialId ?? '';

    const requestId = `sign-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const onApprove = async () => {
      if (!flowAddress || !credentialId) {
        throw new Error('No active account or credential');
      }

      const addr = flowAddress.replace(/^0x/, '');
      // Prepend USER_DOMAIN_TAG per Flow signing convention
      const taggedMessageHex = prependUserDomainTag(message);

      const { signature, extensionData } = await signFlowTransaction({
        messageHex: taggedMessageHex,
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

    add({
      id: requestId,
      type: 'fcl_sign',
      dapp: {
        name: 'dApp',
        url: callback,
        icon: undefined,
      },
      payload: {
        onApprove,
        onReject,
        message,
      },
      callback,
      chainType: 'cadence',
      method: 'user-signature',
      createdAt: Date.now(),
    });

    router.replace(`/sign/${requestId}`);
  }, []);

  // Render nothing — this is purely a routing shim
  return null;
}
