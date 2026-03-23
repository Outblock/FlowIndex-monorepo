import { Command } from 'commander';
import { FlowIndexClient } from '@flowindex/api-client';
import { formatKeyValue, formatJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

export function registerBlockCommand(program: Command): void {
  program
    .command('block [height]')
    .description('Show block details. Default: latest block.')
    .option('--txs', 'include transaction list')
    .action(
      withErrorHandling(async (height: string | undefined, opts: { txs?: boolean }) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        let blockHeight: number | undefined;
        if (height != null) {
          blockHeight = parseInt(height, 10);
          if (isNaN(blockHeight)) {
            console.error(`Invalid block height: "${height}". Must be a number.`);
            process.exit(1);
          }
        }
        const block = await client.getBlock(blockHeight);

        if (format === 'json') {
          console.log(formatJson(block));
          return;
        }

        const b = block as Record<string, unknown>;
        console.log(`Block ${b.height}\n`);
        console.log(
          formatKeyValue([
            ['ID', String(b.id ?? '')],
            ['Parent ID', String(b.parent_id ?? '')],
            ['Timestamp', String(b.timestamp ?? '')],
            ['Transactions', String(b.tx_count ?? 0)],
            ['Events', String(b.event_count ?? 0)],
            ['Collections', String(b.collection_count ?? 0)],
          ]),
        );
      }),
    );
}
