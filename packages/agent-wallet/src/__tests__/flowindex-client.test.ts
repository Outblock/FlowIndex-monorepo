import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowIndexClient } from '../flowindex/client.js';

describe('FlowIndexClient', () => {
  let client: FlowIndexClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    client = new FlowIndexClient('https://test.api');
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  function mockOk(data: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => data,
    });
  }

  function mockError(status: number, text: string) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => text,
    });
  }

  it('getAccount calls correct URL', async () => {
    mockOk({ data: { address: '0x1234' } });
    await client.getAccount('0x1234');
    expect(mockFetch).toHaveBeenCalledWith('https://test.api/flow/account/0x1234');
  });

  it('getFlowBalance extracts FlowToken balance', async () => {
    mockOk({
      data: [
        { token: 'A.1654653399040a61.FlowToken.Vault', balance: '123.456' },
        { token: 'A.xxx.USDC.Vault', balance: '50.0' },
      ],
    });
    const result = (await client.getFlowBalance('0xabc')) as { address: string; balance: string };
    expect(result.address).toBe('0xabc');
    expect(result.balance).toBe('123.456');
  });

  it('getFlowBalance defaults to 0.0 when no FlowToken found', async () => {
    mockOk({ data: [] });
    const result = (await client.getFlowBalance('0xabc')) as { address: string; balance: string };
    expect(result.balance).toBe('0.0');
  });

  it('getFlowBalance defaults to 0.0 when data is undefined', async () => {
    mockOk({});
    const result = (await client.getFlowBalance('0xabc')) as { address: string; balance: string };
    expect(result.balance).toBe('0.0');
  });

  it('getFtBalances calls correct URL', async () => {
    mockOk({ data: [] });
    await client.getFtBalances('0xabc');
    expect(mockFetch).toHaveBeenCalledWith('https://test.api/flow/account/0xabc/ft');
  });

  it('getNftCollections calls correct URL', async () => {
    mockOk({ data: [] });
    await client.getNftCollections('0xabc');
    expect(mockFetch).toHaveBeenCalledWith('https://test.api/flow/account/0xabc/nft');
  });

  it('getTransaction calls correct URL', async () => {
    mockOk({ data: {} });
    await client.getTransaction('abc123');
    expect(mockFetch).toHaveBeenCalledWith('https://test.api/flow/transaction/abc123');
  });

  it('throws on HTTP error with status and body', async () => {
    mockError(404, 'Not Found');
    await expect(client.getAccount('bad')).rejects.toThrow('FlowIndex API error 404: Not Found');
  });

  it('throws on 500 server error', async () => {
    mockError(500, 'Internal Server Error');
    await expect(client.getTransaction('x')).rejects.toThrow('FlowIndex API error 500');
  });
});
