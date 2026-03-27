import { View, Text, Pressable, Switch, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@flowindex/wallet-core';
import { useMobileAuth } from '../../providers/AuthProvider';
import Constants from 'expo-constants';

function SettingsRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };
  return (
    <Pressable onPress={copyable ? handleCopy : undefined} style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
      <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 14, fontFamily: copyable ? 'monospace' : undefined }} numberOfLines={1}>{value}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { activeAccount, network, switchNetwork, evmAddress } = useWallet();
  const { passkeys, signOut } = useMobileAuth();
  const flowAddress = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure? Your passkey is stored securely and you can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', padding: 16 }}>Settings</Text>

        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>ACCOUNT</Text>
        {flowAddress && <SettingsRow label="Flow Address" value={`0x${flowAddress}`} copyable />}
        {evmAddress && <SettingsRow label="EVM Address" value={evmAddress} copyable />}
        {activeAccount?.publicKeySec1Hex && (
          <SettingsRow label="Public Key" value={`${activeAccount.publicKeySec1Hex.slice(0, 16)}...${activeAccount.publicKeySec1Hex.slice(-8)}`} copyable />
        )}

        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>PASSKEY</Text>
        {passkeys.length > 0 ? passkeys.map((pk) => (
          <View key={pk.id} style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{pk.authenticatorName || 'Passkey'}</Text>
            {pk.createdAt && <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>Created: {new Date(pk.createdAt).toLocaleDateString()}</Text>}
            {pk.backedUp && <Text style={{ color: '#00ef8b', fontSize: 12, marginTop: 2 }}>Synced (backed up)</Text>}
          </View>
        )) : <Text style={{ color: '#71717a', paddingHorizontal: 16, paddingVertical: 14 }}>No passkeys found</Text>}

        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>NETWORK</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
          <View>
            <Text style={{ color: '#fff', fontSize: 14 }}>{network === 'mainnet' ? 'Mainnet' : 'Testnet'}</Text>
            <Text style={{ color: '#71717a', fontSize: 12 }}>{network === 'mainnet' ? 'Production network' : 'Testing network'}</Text>
          </View>
          <Switch value={network === 'testnet'} onValueChange={(val) => switchNetwork(val ? 'testnet' : 'mainnet')} trackColor={{ false: '#27272a', true: '#00ef8b' }} thumbColor="#fff" />
        </View>

        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>ABOUT</Text>
        <SettingsRow label="Version" value={Constants.expoConfig?.version || '0.0.1'} />

        <Pressable onPress={handleSignOut} style={{ marginHorizontal: 16, marginTop: 32, marginBottom: 40, backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#ef4444', paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
