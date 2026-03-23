import { describe, it, expect } from 'vitest';
import { formatKeyValue, formatTable, formatJson, formatOutput } from '../src/lib/output.js';

describe('output', () => {
  describe('formatKeyValue', () => {
    it('formats key-value pairs', () => {
      const output = formatKeyValue([
        ['Status', 'Sealed'],
        ['Block', '85,234,567'],
      ]);
      expect(output).toContain('Status');
      expect(output).toContain('Sealed');
      expect(output).toContain('Block');
      expect(output).toContain('85,234,567');
    });
  });

  describe('formatTable', () => {
    it('formats array data as table', () => {
      const output = formatTable(
        ['Name', 'Balance'],
        [
          ['FlowToken', '100.0'],
          ['USDC', '50.0'],
        ],
      );
      expect(output).toContain('Name');
      expect(output).toContain('Balance');
      expect(output).toContain('FlowToken');
      expect(output).toContain('100.0');
    });

    it('handles empty data', () => {
      const output = formatTable(['Name'], []);
      expect(output).toContain('No results');
    });
  });

  describe('formatJson', () => {
    it('formats data as indented JSON', () => {
      const data = { key: 'value' };
      const output = formatJson(data);
      expect(output).toBe(JSON.stringify(data, null, 2));
    });
  });

  describe('formatOutput', () => {
    it('returns JSON when format is json', () => {
      const data = { key: 'value' };
      const output = formatOutput(data, 'json');
      expect(output).toBe(JSON.stringify(data, null, 2));
    });

    it('returns key-value for object with format table', () => {
      const data = { Status: 'Sealed', Block: 85234567 };
      const output = formatOutput(data, 'table');
      expect(output).toContain('Status');
      expect(output).toContain('Sealed');
    });
  });
});
