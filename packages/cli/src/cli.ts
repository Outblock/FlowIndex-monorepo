import { Command } from 'commander';
import { registerBlockCommand } from './commands/block.js';
import { registerTxCommand } from './commands/tx.js';
import { registerAccountCommand } from './commands/account.js';
import { registerSearchCommand } from './commands/search.js';
import { registerConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('flowindex')
  .description('FlowIndex CLI — query Flow blockchain data from the terminal')
  .version('0.1.0');

program
  .option('--format <format>', 'output format: table, json, csv', 'table')
  .option('--quiet', 'minimal output')
  .option('--no-color', 'disable colored output');

registerBlockCommand(program);
registerTxCommand(program);
registerAccountCommand(program);
registerSearchCommand(program);
registerConfigCommand(program);

program.parse();
