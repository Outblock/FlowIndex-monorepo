// ── DeFi event parsing (mirrors backend defi_worker.go) ──

import { parseCadenceEventFields } from './cadence.js';
import type { DefiEvent, RawEvent } from './types.js';

const DEX_PATTERNS = [
  { pattern: '.SwapPair.Swap', dex: 'incrementfi', action: 'Swap' },
  { pattern: '.SwapPair.AddLiquidity', dex: 'incrementfi', action: 'AddLiquidity' },
  { pattern: '.SwapPair.RemoveLiquidity', dex: 'incrementfi', action: 'RemoveLiquidity' },
  { pattern: '.BloctoSwapPair.Swap', dex: 'bloctoswap', action: 'Swap' },
  { pattern: '.MetaPierSwapPair.Swap', dex: 'metapier', action: 'Swap' },
] as const;

function matchDEX(eventType: string): { dex: string; action: string } | null {
  for (const p of DEX_PATTERNS) {
    if (eventType.includes(p.pattern)) {
      return { dex: p.dex, action: p.action };
    }
  }
  return null;
}

function derivePairID(eventType: string): string {
  const parts = eventType.split('.');
  if (parts.length >= 4) {
    return parts.slice(0, 3).join('.');
  }
  return eventType;
}

function str(v: any): string {
  if (v == null) return '';
  return String(v);
}

function isPositive(v: string): boolean {
  if (!v) return false;
  const n = parseFloat(v);
  return !isNaN(n) && n > 0;
}

export function parseDefiEvents(events: RawEvent[]): DefiEvent[] {
  const results: DefiEvent[] = [];

  for (const evt of events) {
    const match = matchDEX(evt.type);
    if (!match) continue;

    const fields = parseCadenceEventFields(evt.payload);
    if (!fields) continue;

    const pairId = derivePairID(evt.type);

    // Extract raw amounts -- fallback names mirror Go logic
    let asset0In = str(fields['amount0In']);
    if (!asset0In) asset0In = str(fields['amountIn']);

    let asset1Out = str(fields['amount1Out']);
    if (!asset1Out) asset1Out = str(fields['amountOut']);

    const asset0Out = str(fields['amount0Out']);
    const asset1In = str(fields['amount1In']);

    const token0Symbol = str(fields['token0Symbol']);
    const token1Symbol = str(fields['token1Symbol']);

    let amountIn: string;
    let amountOut: string;
    let tokenIn: string | undefined;
    let tokenOut: string | undefined;

    if (match.action === 'Swap') {
      // Determine swap direction
      if (isPositive(asset0In)) {
        // token0 → token1
        amountIn = asset0In;
        amountOut = asset1Out;
        tokenIn = token0Symbol || undefined;
        tokenOut = token1Symbol || undefined;
      } else if (isPositive(asset1In)) {
        // token1 → token0
        amountIn = asset1In;
        amountOut = asset0Out;
        tokenIn = token1Symbol || undefined;
        tokenOut = token0Symbol || undefined;
      } else {
        // Fallback: use whatever we have
        amountIn = asset0In || asset1In;
        amountOut = asset1Out || asset0Out;
        tokenIn = token0Symbol || undefined;
        tokenOut = token1Symbol || undefined;
      }
    } else {
      // AddLiquidity / RemoveLiquidity -- no direction logic, report both amounts
      amountIn = asset0In || asset1In;
      amountOut = asset1Out || asset0Out;
      tokenIn = token0Symbol || undefined;
      tokenOut = token1Symbol || undefined;
    }

    results.push({
      dex: match.dex,
      action: match.action,
      pairId,
      amountIn,
      amountOut,
      tokenIn,
      tokenOut,
      event_index: evt.event_index ?? 0,
    });
  }

  return results;
}
