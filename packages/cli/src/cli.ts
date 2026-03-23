import { Command } from 'commander';

const program = new Command();

program
  .name('flowindex')
  .description('FlowIndex CLI — query Flow blockchain data from the terminal')
  .version('0.1.0');

program
  .option('--format <format>', 'output format: table, json, csv', 'table')
  .option('--quiet', 'minimal output')
  .option('--no-color', 'disable colored output');

program.parse();
