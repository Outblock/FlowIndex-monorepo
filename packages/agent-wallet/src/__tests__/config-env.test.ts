import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../config/env.js';

describe('config/env — loadConfig', () => {
  const saved: Record<string, string | undefined> = {};

  function setEnv(vars: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(vars)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => {
    // Clear all relevant env vars
    setEnv({
      FLOW_MNEMONIC: undefined,
      FLOW_PRIVATE_KEY: undefined,
      FLOWINDEX_TOKEN: undefined,
      FLOW_NETWORK: undefined,
      FLOW_ADDRESS: undefined,
      FLOW_KEY_INDEX: undefined,
      FLOW_SIG_ALGO: undefined,
      FLOW_HASH_ALGO: undefined,
      EVM_PRIVATE_KEY: undefined,
      EVM_ACCOUNT_INDEX: undefined,
      FLOWINDEX_URL: undefined,
      FLOW_SIMULATOR_ENABLED: undefined,
      FLOW_SIMULATOR_URL: undefined,
      ALLOW_RAW_CADENCE_SIGNING: undefined,
      APPROVAL_REQUIRED: undefined,
      ETHERSCAN_API_KEY: undefined,
    });
  });

  it('defaults to cloud-interactive when no credentials provided', () => {
    const config = loadConfig();
    expect(config.signerType).toBe('cloud-interactive');
    expect(config.network).toBe('mainnet');
    expect(config.sigAlgo).toBe('ECDSA_secp256k1');
    expect(config.hashAlgo).toBe('SHA2_256');
    expect(config.approvalRequired).toBe(true);
    expect(config.flowindexUrl).toBe('https://flowindex.io/api');
    expect(config.flowSimulatorEnabled).toBe(true);
    expect(config.flowSimulatorUrl).toBe('https://simulator.flowindex.io/api');
    expect(config.allowRawCadenceSigning).toBe(false);
  });

  it('detects local-mnemonic signer when FLOW_MNEMONIC is set', () => {
    setEnv({ FLOW_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' });
    const config = loadConfig();
    expect(config.signerType).toBe('local-mnemonic');
    expect(config.mnemonic).toBeTruthy();
  });

  it('detects local-key signer when FLOW_PRIVATE_KEY is set', () => {
    setEnv({ FLOW_PRIVATE_KEY: 'deadbeef'.repeat(8) });
    const config = loadConfig();
    expect(config.signerType).toBe('local-key');
    expect(config.privateKey).toBe('deadbeef'.repeat(8));
  });

  it('prefers mnemonic over privateKey', () => {
    setEnv({
      FLOW_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      FLOW_PRIVATE_KEY: 'deadbeef'.repeat(8),
    });
    const config = loadConfig();
    expect(config.signerType).toBe('local-mnemonic');
  });

  it('detects cloud signer when FLOWINDEX_TOKEN is set', () => {
    setEnv({ FLOWINDEX_TOKEN: 'some-jwt-token' });
    const config = loadConfig();
    expect(config.signerType).toBe('cloud');
  });

  it('parses FLOW_KEY_INDEX correctly', () => {
    setEnv({ FLOW_KEY_INDEX: '3' });
    const config = loadConfig();
    expect(config.flowKeyIndex).toBe(3);
  });

  it('parses testnet network', () => {
    setEnv({ FLOW_NETWORK: 'testnet' });
    const config = loadConfig();
    expect(config.network).toBe('testnet');
  });

  it('throws on invalid network', () => {
    setEnv({ FLOW_NETWORK: 'devnet' });
    expect(() => loadConfig()).toThrow('Invalid FLOW_NETWORK');
  });

  it('throws on invalid sig algo', () => {
    setEnv({ FLOW_SIG_ALGO: 'RSA_2048' });
    expect(() => loadConfig()).toThrow('Invalid FLOW_SIG_ALGO');
  });

  it('throws on invalid hash algo', () => {
    setEnv({ FLOW_HASH_ALGO: 'MD5' });
    expect(() => loadConfig()).toThrow('Invalid FLOW_HASH_ALGO');
  });

  it('APPROVAL_REQUIRED=false disables approval', () => {
    setEnv({ APPROVAL_REQUIRED: 'false' });
    const config = loadConfig();
    expect(config.approvalRequired).toBe(false);
  });

  it('FLOW_SIMULATOR_ENABLED=false disables preflight simulation', () => {
    setEnv({ FLOW_SIMULATOR_ENABLED: 'false' });
    const config = loadConfig();
    expect(config.flowSimulatorEnabled).toBe(false);
  });

  it('ALLOW_RAW_CADENCE_SIGNING=true enables headless raw cadence signing', () => {
    setEnv({ ALLOW_RAW_CADENCE_SIGNING: 'true' });
    const config = loadConfig();
    expect(config.allowRawCadenceSigning).toBe(true);
  });

  it('accepts ECDSA_P256 + SHA3_256 combination', () => {
    setEnv({ FLOW_SIG_ALGO: 'ECDSA_P256', FLOW_HASH_ALGO: 'SHA3_256' });
    const config = loadConfig();
    expect(config.sigAlgo).toBe('ECDSA_P256');
    expect(config.hashAlgo).toBe('SHA3_256');
  });
});
