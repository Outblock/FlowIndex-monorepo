import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, getConfigDir, resetConfig, type CliConfig } from '../src/lib/config.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config', () => {
  let tmpDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'flowindex-cli-test-'));
    process.env = { ...originalEnv, XDG_CONFIG_HOME: tmpDir };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  it('returns default config when no file exists', () => {
    const config = loadConfig();
    expect(config.outputFormat).toBe('table');
    expect(config.color).toBe(true);
    expect(config.network).toBe('mainnet');
  });

  it('saves and loads config', () => {
    saveConfig({ outputFormat: 'json', color: false, network: 'mainnet' });
    const config = loadConfig();
    expect(config.outputFormat).toBe('json');
    expect(config.color).toBe(false);
  });

  it('merges partial saves with defaults', () => {
    saveConfig({ outputFormat: 'csv' } as CliConfig);
    const config = loadConfig();
    expect(config.outputFormat).toBe('csv');
    expect(config.color).toBe(true);
  });

  it('resets to defaults', () => {
    saveConfig({ outputFormat: 'json', color: false, network: 'mainnet' });
    resetConfig();
    const config = loadConfig();
    expect(config.outputFormat).toBe('table');
  });

  it('respects XDG_CONFIG_HOME', () => {
    const dir = getConfigDir();
    expect(dir).toBe(join(tmpDir, 'flowindex'));
  });
});
