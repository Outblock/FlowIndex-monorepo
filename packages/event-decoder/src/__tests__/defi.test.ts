import { describe, it, expect } from 'vitest';
import { parseDefiEvents } from '../defi.js';

function makeSwapEvent(
  contractAddr: string,
  contractName: string,
  eventName: string,
  fieldValues: Record<string, { type: string; value: string }>,
) {
  return {
    type: `A.${contractAddr}.${contractName}.${eventName}`,
    payload: {
      value: {
        fields: Object.entries(fieldValues).map(([name, value]) => ({
          name,
          value,
        })),
      },
    },
  };
}

describe('parseDefiEvents', () => {
  it('parses IncrementFi swap (token0 → token1)', () => {
    const events = [
      makeSwapEvent('b063c16cac85dbd1', 'SwapPair', 'Swap', {
        amount0In: { type: 'UFix64', value: '10.50000000' },
        amount1Out: { type: 'UFix64', value: '25.30000000' },
        amount0Out: { type: 'UFix64', value: '0.00000000' },
        amount1In: { type: 'UFix64', value: '0.00000000' },
        token0Symbol: { type: 'String', value: 'FLOW' },
        token1Symbol: { type: 'String', value: 'USDC' },
      }),
    ];
    const result = parseDefiEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].dex).toBe('incrementfi');
    expect(result[0].action).toBe('Swap');
    expect(result[0].amountIn).toBe('10.50000000');
    expect(result[0].amountOut).toBe('25.30000000');
    expect(result[0].tokenIn).toBe('FLOW');
    expect(result[0].tokenOut).toBe('USDC');
    expect(result[0].pairId).toBe('A.b063c16cac85dbd1.SwapPair');
  });

  it('parses reverse swap (token1 → token0)', () => {
    const events = [
      makeSwapEvent('b063c16cac85dbd1', 'SwapPair', 'Swap', {
        amount0In: { type: 'UFix64', value: '0.00000000' },
        amount1Out: { type: 'UFix64', value: '0.00000000' },
        amount0Out: { type: 'UFix64', value: '10.00000000' },
        amount1In: { type: 'UFix64', value: '25.00000000' },
        token0Symbol: { type: 'String', value: 'FLOW' },
        token1Symbol: { type: 'String', value: 'USDC' },
      }),
    ];
    const result = parseDefiEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].amountIn).toBe('25.00000000');
    expect(result[0].amountOut).toBe('10.00000000');
    expect(result[0].tokenIn).toBe('USDC');
    expect(result[0].tokenOut).toBe('FLOW');
  });

  it('parses BloctoSwap swap', () => {
    const events = [
      makeSwapEvent('d9a6a94355a4a023', 'BloctoSwapPair', 'Swap', {
        amount0In: { type: 'UFix64', value: '5.00000000' },
        amount1Out: { type: 'UFix64', value: '12.00000000' },
        amount0Out: { type: 'UFix64', value: '0.00000000' },
        amount1In: { type: 'UFix64', value: '0.00000000' },
        token0Symbol: { type: 'String', value: 'FLOW' },
        token1Symbol: { type: 'String', value: 'tUSDT' },
      }),
    ];
    const result = parseDefiEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].dex).toBe('bloctoswap');
    expect(result[0].action).toBe('Swap');
    expect(result[0].amountIn).toBe('5.00000000');
    expect(result[0].amountOut).toBe('12.00000000');
    expect(result[0].tokenIn).toBe('FLOW');
    expect(result[0].tokenOut).toBe('tUSDT');
    expect(result[0].pairId).toBe('A.d9a6a94355a4a023.BloctoSwapPair');
  });

  it('parses MetaPier swap', () => {
    const events = [
      makeSwapEvent('aaa999bbb888ccc7', 'MetaPierSwapPair', 'Swap', {
        amount0In: { type: 'UFix64', value: '100.00000000' },
        amount1Out: { type: 'UFix64', value: '200.00000000' },
        amount0Out: { type: 'UFix64', value: '0.00000000' },
        amount1In: { type: 'UFix64', value: '0.00000000' },
        token0Symbol: { type: 'String', value: 'FLOW' },
        token1Symbol: { type: 'String', value: 'DUST' },
      }),
    ];
    const result = parseDefiEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].dex).toBe('metapier');
    expect(result[0].action).toBe('Swap');
  });

  it('parses AddLiquidity', () => {
    const events = [
      makeSwapEvent('b063c16cac85dbd1', 'SwapPair', 'AddLiquidity', {
        amount0In: { type: 'UFix64', value: '50.00000000' },
        amount1Out: { type: 'UFix64', value: '100.00000000' },
        amount0Out: { type: 'UFix64', value: '0.00000000' },
        amount1In: { type: 'UFix64', value: '0.00000000' },
        token0Symbol: { type: 'String', value: 'FLOW' },
        token1Symbol: { type: 'String', value: 'USDC' },
      }),
    ];
    const result = parseDefiEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].dex).toBe('incrementfi');
    expect(result[0].action).toBe('AddLiquidity');
    expect(result[0].amountIn).toBe('50.00000000');
    expect(result[0].amountOut).toBe('100.00000000');
  });

  it('parses RemoveLiquidity', () => {
    const events = [
      makeSwapEvent('b063c16cac85dbd1', 'SwapPair', 'RemoveLiquidity', {
        amount0In: { type: 'UFix64', value: '30.00000000' },
        amount1Out: { type: 'UFix64', value: '60.00000000' },
        amount0Out: { type: 'UFix64', value: '0.00000000' },
        amount1In: { type: 'UFix64', value: '0.00000000' },
        token0Symbol: { type: 'String', value: 'FLOW' },
        token1Symbol: { type: 'String', value: 'USDC' },
      }),
    ];
    const result = parseDefiEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].dex).toBe('incrementfi');
    expect(result[0].action).toBe('RemoveLiquidity');
    expect(result[0].amountIn).toBe('30.00000000');
    expect(result[0].amountOut).toBe('60.00000000');
  });

  it('ignores non-DEX events', () => {
    expect(
      parseDefiEvents([
        { type: 'A.xxx.FlowToken.TokensWithdrawn', payload: {} },
      ]),
    ).toEqual([]);
  });

  it('handles empty events', () => {
    expect(parseDefiEvents([])).toEqual([]);
  });

  it('uses amountIn/amountOut fallback field names', () => {
    const events = [
      makeSwapEvent('b063c16cac85dbd1', 'SwapPair', 'Swap', {
        amountIn: { type: 'UFix64', value: '7.00000000' },
        amountOut: { type: 'UFix64', value: '14.00000000' },
        token0Symbol: { type: 'String', value: 'FLOW' },
        token1Symbol: { type: 'String', value: 'USDC' },
      }),
    ];
    const result = parseDefiEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].amountIn).toBe('7.00000000');
    expect(result[0].amountOut).toBe('14.00000000');
  });

  it('sets event_index from raw event', () => {
    const events = [
      {
        ...makeSwapEvent('b063c16cac85dbd1', 'SwapPair', 'Swap', {
          amount0In: { type: 'UFix64', value: '1.00000000' },
          amount1Out: { type: 'UFix64', value: '2.00000000' },
          amount0Out: { type: 'UFix64', value: '0.00000000' },
          amount1In: { type: 'UFix64', value: '0.00000000' },
        }),
        event_index: 5,
      },
    ];
    const result = parseDefiEvents(events);
    expect(result[0].event_index).toBe(5);
  });

  it('skips events with null/invalid payload', () => {
    const events = [
      { type: 'A.b063c16cac85dbd1.SwapPair.Swap', payload: null },
    ];
    expect(parseDefiEvents(events)).toEqual([]);
  });
});
