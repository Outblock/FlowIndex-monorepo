import { Command } from 'commander';
import { FlowIndexClient } from '@flowindex/api-client';
import { detectInputType, InputType } from '../lib/detect.js';
import { formatKeyValue, formatTable, formatJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

interface AccountOpts {
  transfers?: boolean;
  ft?: boolean;
  nft?: boolean;
  contracts?: boolean;
  keys?: boolean;
  limit?: string;
}

export function registerAccountCommand(program: Command): void {
  program
    .command('account <address>')
    .description('Account overview. Auto-detects Flow or EVM address.')
    .option('--transfers', 'show recent transfers')
    .option('--ft', 'show FT holdings')
    .option('--nft', 'show NFT holdings')
    .option('--contracts', 'show deployed contracts')
    .option('--keys', 'show account keys')
    .option('--limit <n>', 'limit results', '20')
    .action(
      withErrorHandling(async (address: string, opts: AccountOpts) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        const detected = detectInputType(address);

        if (detected.type === InputType.EvmAddress) {
          const data = await client.getEvmAddress(String(detected.value));
          if (format === 'json') {
            console.log(formatJson(data));
          } else {
            printEvmAddress(data as Record<string, unknown>);
          }
          return;
        }

        const addr =
          detected.type === InputType.FlowAddress ? String(detected.value) : address;

        const account = (await client.getAccount(addr)) as Record<string, unknown>;

        if (format === 'json') {
          console.log(formatJson(account));
          return;
        }

        printFlowAccount(account);

        if (opts.ft) {
          const ft = (await client.getAccountFtHoldings(addr)) as Record<string, unknown>;
          console.log('\n  FT Holdings');
          const items = (ft as any)?.data ?? ft;
          if (Array.isArray(items) && items.length > 0) {
            console.log(
              formatTable(
                ['Token', 'Balance', 'USD Value'],
                items.map((t: any) => [
                  t.token_name || t.token_type || '',
                  t.balance || '0',
                  t.usd_value != null ? `$${t.usd_value}` : '-',
                ]),
              ),
            );
          } else {
            console.log('  No FT holdings found.');
          }
        }

        if (opts.nft) {
          const nft = (await client.getAccountNftCollections(addr)) as Record<string, unknown>;
          console.log('\n  NFT Collections');
          const items = (nft as any)?.data ?? nft;
          if (Array.isArray(items) && items.length > 0) {
            console.log(
              formatTable(
                ['Collection', 'Count'],
                items.map((c: any) => [c.collection_name || c.collection_type || '', String(c.count || 0)]),
              ),
            );
          } else {
            console.log('  No NFT collections found.');
          }
        }

        if (opts.transfers) {
          const limit = parseInt(opts.limit || '20', 10);
          const transfers = (await client.getAccountTransfers(addr, limit)) as Record<string, unknown>;
          console.log('\n  Recent Transfers');
          const items = (transfers as any)?.data ?? transfers;
          if (Array.isArray(items) && items.length > 0) {
            console.log(
              formatTable(
                ['TX ID', 'Type', 'Amount', 'Timestamp'],
                items.map((t: any) => [
                  (t.tx_id || '').slice(0, 16) + '...',
                  t.type || '',
                  t.amount || '',
                  t.timestamp || '',
                ]),
              ),
            );
          } else {
            console.log('  No transfers found.');
          }
        }
      }),
    );
}

function printFlowAccount(acct: Record<string, unknown>): void {
  console.log(`Account ${acct.address}\n`);
  const pairs: [string, string][] = [
    ['Balance', `${acct.flowBalance ?? 0} FLOW`],
  ];
  if (acct.flowStorage != null) {
    pairs.push(['Storage', `${acct.flowStorage} bytes`]);
  }
  if (acct.contracts && Array.isArray(acct.contracts) && acct.contracts.length > 0) {
    pairs.push(['Contracts', (acct.contracts as string[]).join(', ')]);
  }
  if (acct.is_contract) {
    pairs.push(['Is Contract', 'Yes']);
  }
  console.log(formatKeyValue(pairs));

  const keys = acct.keys as Array<Record<string, unknown>> | undefined;
  if (keys && keys.length > 0) {
    console.log(`\n  Keys (${keys.length})`);
    keys.forEach((k) => {
      const status = k.revoked ? ' [REVOKED]' : '';
      console.log(`  - #${k.index} weight=${k.weight} ${k.signatureAlgorithm}/${k.hashAlgorithm}${status}`);
    });
  }
}

function printEvmAddress(data: Record<string, unknown>): void {
  console.log(`EVM Address ${data.address}\n`);
  console.log(
    formatKeyValue([
      ['Balance', String(data.balance ?? '0')],
      ['Is Contract', data.is_contract ? 'Yes' : 'No'],
    ]),
  );
}
