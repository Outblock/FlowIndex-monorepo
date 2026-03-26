import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWallet, useBalance, FLOW_TRANSFER_TX, MAINNET_ALIASES, TESTNET_ALIASES } from '@flowindex/wallet-core';
import { useMobileAuth } from '../../providers/AuthProvider';
import * as fcl from '@onflow/fcl';

type Step = 'form' | 'review' | 'signing' | 'result';

export default function SendScreen() {
  const router = useRouter();
  const { activeAccount, network } = useWallet();
  const { getFlowAuthz } = useMobileAuth();

  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  const { holdings } = useBalance(flowAddress ? `0x${flowAddress}` : '');
  const flowBalance = holdings.find((h) => h.symbol === 'FLOW')?.balance ?? 0;

  const [step, setStep] = useState<Step>('form');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');

  const isValidAddress = /^0x[0-9a-fA-F]{16}$/.test(recipient);
  const parsedAmount = parseFloat(amount) || 0;
  const hasEnough = parsedAmount > 0 && parsedAmount <= flowBalance;

  const handleReview = () => {
    if (!isValidAddress) {
      Alert.alert('Invalid Address', 'Enter a valid Flow address (0x + 16 hex chars)');
      return;
    }
    if (!hasEnough) {
      Alert.alert('Invalid Amount', parsedAmount <= 0 ? 'Enter a positive amount' : 'Insufficient balance');
      return;
    }
    setStep('review');
  };

  const handleSend = async () => {
    if (!activeAccount || !flowAddress) return;
    setStep('signing');
    setError('');

    try {
      const accessNode = network === 'testnet'
        ? 'https://rest-testnet.onflow.org'
        : 'https://rest-mainnet.onflow.org';
      const aliases = network === 'testnet' ? TESTNET_ALIASES : MAINNET_ALIASES;

      fcl.config().put('accessNode.api', accessNode).put('flow.network', network);
      for (const [alias, address] of Object.entries(aliases)) {
        fcl.config().put(`0x${alias.replace('0x', '')}`, address);
      }

      const authz = getFlowAuthz(flowAddress, 0, activeAccount.credentialId);

      const txId = await fcl.mutate({
        cadence: FLOW_TRANSFER_TX,
        args: (arg: any, t: any) => [
          arg(parsedAmount.toFixed(8), t.UFix64),
          arg(recipient, t.Address),
        ],
        proposer: authz,
        payer: authz,
        authorizations: [authz],
        limit: 1000,
      });

      setTxHash(txId);
      setStep('result');
    } catch (e: any) {
      setError(e.message || 'Transaction failed');
      setStep('result');
    }
  };

  if (step === 'form') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }} edges={['bottom']}>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 6 }}>Recipient</Text>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="0x..."
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#27272a', marginBottom: 20 }}
          />
          <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 6 }}>Amount (FLOW)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#52525b"
            keyboardType="decimal-pad"
            style={{ backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#27272a', marginBottom: 8 }}
          />
          <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 24 }}>
            Balance: {flowBalance.toFixed(4)} FLOW
          </Text>
          <Pressable
            onPress={handleReview}
            disabled={!isValidAddress || !hasEnough}
            style={{ backgroundColor: isValidAddress && hasEnough ? '#00ef8b' : '#27272a', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: isValidAddress && hasEnough ? '#0a0a0a' : '#71717a', fontSize: 17, fontWeight: '700' }}>Review</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'review') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }} edges={['bottom']}>
        <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, gap: 16 }}>
            <Text style={{ color: '#a1a1aa', fontSize: 13 }}>Sending</Text>
            <Text style={{ color: '#00ef8b', fontSize: 32, fontWeight: '700' }}>{parsedAmount.toFixed(4)} FLOW</Text>
            <View>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 4 }}>To</Text>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'monospace' }}>{recipient}</Text>
            </View>
            <View>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 4 }}>From</Text>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'monospace' }}>0x{flowAddress}</Text>
            </View>
            <View>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 4 }}>Network</Text>
              <Text style={{ color: '#fff', fontSize: 14 }}>{network === 'mainnet' ? 'Flow Mainnet' : 'Flow Testnet'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <Pressable onPress={() => setStep('form')} style={{ flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Back</Text>
            </Pressable>
            <Pressable onPress={handleSend} style={{ flex: 1, backgroundColor: '#00ef8b', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#0a0a0a', fontSize: 15, fontWeight: '700' }}>Confirm & Sign</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'signing') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00ef8b" size="large" />
        <Text style={{ color: '#a1a1aa', fontSize: 16, marginTop: 16 }}>Signing transaction...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 24 }}>
      {txHash ? (
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Text style={{ color: '#00ef8b', fontSize: 24, fontWeight: '700' }}>Sent!</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center' }}>
            {parsedAmount.toFixed(4)} FLOW to {recipient.slice(0, 8)}...{recipient.slice(-4)}
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, fontFamily: 'monospace' }}>Tx: {txHash.slice(0, 16)}...</Text>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Text style={{ color: '#ef4444', fontSize: 24, fontWeight: '700' }}>Failed</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center' }}>{error}</Text>
        </View>
      )}
      <Pressable onPress={() => router.back()} style={{ backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 32 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Done</Text>
      </Pressable>
    </SafeAreaView>
  );
}
