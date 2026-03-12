import { afterEach, describe, expect, it, vi } from 'vitest';
const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('@onflow/fcl', () => ({
  query: queryMock,
}));

import { executeCadenceScript } from '../cadence/script.js';

describe('cadence/script', () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it('executes a raw cadence script through FCL query', async () => {
    queryMock.mockResolvedValue({ ok: true });

    const result = await executeCadenceScript(
      'access(all) fun main(address: Address): Address { return address }',
      [{ type: 'Address', value: '1234' }],
    );

    expect(result).toEqual({ ok: true });
    expect(queryMock).toHaveBeenCalledTimes(1);

    const config = queryMock.mock.calls[0]?.[0] as {
      cadence: string;
      args?: (arg: (value: unknown, type: unknown) => unknown, t: Record<string, unknown>) => unknown[];
      limit: number;
    };

    expect(config.cadence).toContain('fun main');
    expect(config.limit).toBe(9999);
    expect(config.args).toBeTypeOf('function');
  });
});
