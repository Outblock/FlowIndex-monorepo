import { describe, it, expect } from 'vitest';
import { getTemplates, getTemplate, listTemplates } from '../templates/registry.js';

describe('templates/registry', () => {
  it('loads templates from disk', () => {
    const all = getTemplates();
    expect(all.length).toBeGreaterThan(0);
    // We know there are ~70 templates
    expect(all.length).toBeGreaterThanOrEqual(30);
  });

  it('each template has required fields', () => {
    for (const t of getTemplates()) {
      expect(t.name, `${t.name}: name`).toBeTruthy();
      expect(t.category, `${t.name}: category`).toBeTruthy();
      expect(['transaction', 'script'], `${t.name}: type`).toContain(t.type);
      expect(t.description, `${t.name}: description`).toBeTruthy();
      expect(t.cadence, `${t.name}: cadence`).toBeTruthy();
      expect(Array.isArray(t.args), `${t.name}: args is array`).toBe(true);
    }
  });

  it('getTemplate returns known template by name', () => {
    const t = getTemplate('transfer_tokens_v3');
    expect(t).toBeDefined();
    expect(t!.type).toBe('transaction');
    expect(t!.args.length).toBe(3);
    expect(t!.args.map((a) => a.name)).toEqual(['vaultIdentifier', 'recipient', 'amount']);
  });

  it('getTemplate returns undefined for unknown', () => {
    expect(getTemplate('does_not_exist')).toBeUndefined();
  });

  it('listTemplates filters by category', () => {
    const evm = listTemplates('evm');
    expect(evm.length).toBeGreaterThan(0);
    for (const t of evm) {
      expect(t.category).toBe('evm');
    }
  });

  it('listTemplates with no category returns all', () => {
    const all = listTemplates();
    expect(all.length).toBe(getTemplates().length);
  });

  it('known categories exist', () => {
    const categories = [...new Set(getTemplates().map((t) => t.category))];
    expect(categories).toContain('base');
    expect(categories).toContain('token');
    expect(categories).toContain('evm');
    expect(categories).toContain('bridge');
  });

  it('hand-curated template metadata overrides auto-parsed args', () => {
    const t = getTemplate('create_coa');
    expect(t).toBeDefined();
    // Hand-curated has description for the args
    expect(t!.args[0].description).toBeTruthy();
  });

  it('auto-parsed args have correct types for transaction templates', () => {
    const templates = getTemplates().filter((t) => t.type === 'transaction' && t.args.length > 0);
    for (const t of templates) {
      for (const arg of t.args) {
        expect(arg.name, `${t.name}: arg name`).toBeTruthy();
        expect(arg.type, `${t.name}.${arg.name}: has type`).toBeTruthy();
      }
    }
  });
});
