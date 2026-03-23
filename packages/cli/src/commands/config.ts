import { Command } from 'commander';
import { loadConfig, saveConfig, resetConfig, type CliConfig } from '../lib/config.js';
import { formatKeyValue, formatJson } from '../lib/output.js';

const VALID_KEYS: Record<string, string> = {
  'output-format': 'outputFormat',
  color: 'color',
  network: 'network',
};

export function registerConfigCommand(program: Command): void {
  const config = program.command('config').description('Manage CLI configuration');

  config
    .command('set <key> <value>')
    .description('Set a config value. Keys: output-format, color, network')
    .action((key: string, value: string) => {
      const configKey = VALID_KEYS[key];
      if (!configKey) {
        console.error(`Unknown config key: ${key}. Valid keys: ${Object.keys(VALID_KEYS).join(', ')}`);
        process.exit(1);
      }

      let parsedValue: unknown = value;
      if (key === 'color') {
        parsedValue = value === 'true';
      }
      if (key === 'output-format' && !['table', 'json', 'csv'].includes(value)) {
        console.error('output-format must be one of: table, json, csv');
        process.exit(1);
      }
      if (key === 'network' && !['mainnet', 'testnet'].includes(value)) {
        console.error('network must be one of: mainnet, testnet');
        process.exit(1);
      }

      saveConfig({ [configKey]: parsedValue } as Partial<CliConfig>);
      console.log(`Set ${key} = ${value}`);
    });

  config
    .command('get <key>')
    .description('Get a config value')
    .action((key: string) => {
      const configKey = VALID_KEYS[key];
      if (!configKey) {
        console.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
      const cfg = loadConfig();
      console.log((cfg as any)[configKey]);
    });

  config
    .command('list')
    .description('Show all config values')
    .action(() => {
      const format = program.opts().format ?? 'table';
      const cfg = loadConfig();
      if (format === 'json') {
        console.log(formatJson(cfg));
      } else {
        console.log(
          formatKeyValue([
            ['output-format', cfg.outputFormat],
            ['color', String(cfg.color)],
            ['network', cfg.network],
          ]),
        );
      }
    });

  config
    .command('reset')
    .description('Reset config to defaults')
    .action(() => {
      resetConfig();
      console.log('Config reset to defaults.');
    });
}
