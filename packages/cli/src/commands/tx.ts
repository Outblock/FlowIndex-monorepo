import { Command } from 'commander';
import { FlowIndexClient, FlowIndexApiError } from '@flowindex/api-client';
import { detectInputType, InputType } from '../lib/detect.js';
import { formatKeyValue, formatJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

export function registerTxCommand(program: Command): void {
  program
    .command('tx <hash>')
    .description('Show transaction details. Auto-detects Cadence or EVM hash.')
    .option('--events', 'show full event details')
    .action(
      withErrorHandling(async (hash: string, opts: { events?: boolean }) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        const detected = detectInputType(hash);

        let tx: Record<string, unknown> | null = null;
        let isEvm = false;

        if (detected.type === InputType.EvmTxHash) {
          try {
            tx = (await client.getEvmTransaction(String(detected.value))) as Record<string, unknown>;
            isEvm = true;
          } catch (err) {
            if (err instanceof FlowIndexApiError && err.status === 404) {
              const flowHash = String(detected.value).slice(2);
              tx = (await client.getTransaction(flowHash)) as Record<string, unknown>;
            } else {
              throw err;
            }
          }
        } else {
          tx = (await client.getTransaction(String(detected.value))) as Record<string, unknown>;
          isEvm = !!(tx as any)?.is_evm;
        }

        if (format === 'json') {
          console.log(formatJson(tx));
          return;
        }

        if (isEvm) {
          printEvmTx(tx!);
        } else {
          printFlowTx(tx!, opts.events);
        }
      }),
    );
}

function printFlowTx(tx: Record<string, unknown>, showEvents?: boolean): void {
  console.log(`Transaction ${tx.id}\n`);
  const pairs: [string, string][] = [
    ['Status', String(tx.status ?? '')],
    ['Block', String(tx.block_height ?? '')],
    ['Timestamp', String(tx.timestamp ?? '')],
  ];
  if (tx.proposer) pairs.push(['Proposer', String(tx.proposer)]);
  if (tx.payer) pairs.push(['Payer', String(tx.payer)]);
  if (tx.authorizers) pairs.push(['Authorizers', String((tx.authorizers as string[])?.join(', ') ?? '')]);
  if (tx.fee != null) pairs.push(['Fee', `${tx.fee} FLOW`]);
  if (tx.gas_used != null) pairs.push(['Gas Used', String(tx.gas_used)]);
  if (tx.error) pairs.push(['Error', String(tx.error)]);
  console.log(formatKeyValue(pairs));

  if (tx.is_evm && tx.evm_hash) {
    console.log(`\n  EVM Hash     ${tx.evm_hash}`);
  }

  const events = tx.events as Array<Record<string, unknown>> | undefined;
  if (events && events.length > 0) {
    console.log(`\n  Events (${events.length})`);
    const lastIdx = events.length - 1;
    events.forEach((evt, i) => {
      const prefix = i === lastIdx ? '  └─' : '  ├─';
      const type = String(evt.type ?? '');
      const shortType = type.split('.').slice(-2).join('.');
      if (showEvents) {
        console.log(`${prefix} ${shortType}`);
        console.log(`       ${evt.value ?? ''}`);
      } else {
        console.log(`${prefix} ${shortType}`);
      }
    });
  }
}

function printEvmTx(tx: Record<string, unknown>): void {
  console.log(`EVM Transaction ${tx.hash}\n`);
  console.log(
    formatKeyValue([
      ['Status', String(tx.status ?? '')],
      ['Block', String(tx.block_height ?? '')],
      ['Timestamp', String(tx.timestamp ?? '')],
      ['From', String(tx.from_address ?? '')],
      ['To', String(tx.to_address ?? '')],
      ['Value', String(tx.value ?? '0')],
      ['Gas Used', String(tx.gas_used ?? '')],
    ]),
  );

  if (tx.cadence_tx_id) {
    console.log(`\n  Cadence TX   ${tx.cadence_tx_id}`);
  }
}
