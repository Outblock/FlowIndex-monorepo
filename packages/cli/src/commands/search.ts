import { Command } from 'commander';
import { FlowIndexClient } from '@flowindex/api-client';
import { formatTable, formatJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search across transactions, accounts, contracts, tokens.')
    .option('--type <type>', 'filter by type: tx, account, contract, token, nft, block, node')
    .option('--limit <n>', 'limit results', '20')
    .action(
      withErrorHandling(async (query: string, opts: { type?: string; limit?: string }) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        const results = await client.search(query, opts.type);

        if (format === 'json') {
          console.log(formatJson(results));
          return;
        }

        const { data } = results;
        const contracts = data?.contracts ?? [];
        const tokens = data?.tokens ?? [];
        const hasResults = contracts.length > 0 || tokens.length > 0;

        if (!hasResults) {
          console.log('No results found.');
          return;
        }

        console.log(`Search results for "${query}"\n`);

        if (contracts.length > 0) {
          console.log('Contracts:');
          console.log(
            formatTable(
              ['Name', 'Address', 'Kind', 'Dependents'],
              contracts.map((c) => [
                c.name,
                c.address.length > 20 ? c.address.slice(0, 20) + '...' : c.address,
                c.kind ?? '',
                String(c.dependent_count ?? ''),
              ]),
            ),
          );
        }

        if (tokens.length > 0) {
          if (contracts.length > 0) console.log('');
          console.log('Tokens:');
          console.log(
            formatTable(
              ['Symbol', 'Name', 'Address', 'Contract'],
              tokens.map((t) => [
                t.symbol,
                t.name,
                t.address.length > 20 ? t.address.slice(0, 20) + '...' : t.address,
                t.contract_name,
              ]),
            ),
          );
        }
      }),
    );
}
