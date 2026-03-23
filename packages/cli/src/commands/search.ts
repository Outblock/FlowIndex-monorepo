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

        const items = results.results ?? [];
        if (items.length === 0) {
          console.log('No results found.');
          return;
        }

        console.log(`Search results for "${query}"\n`);
        console.log(
          formatTable(
            ['Type', 'ID', 'Title', 'Details'],
            items.map((r) => [
              r.type,
              r.id.length > 20 ? r.id.slice(0, 20) + '...' : r.id,
              r.title,
              r.subtitle ?? '',
            ]),
          ),
        );
      }),
    );
}
