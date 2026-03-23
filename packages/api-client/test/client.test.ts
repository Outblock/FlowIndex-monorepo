import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowIndexClient } from '../src/client.js';
import { FlowIndexApiError } from '../src/errors.js';

const mockFetch = vi.fn();

describe('FlowIndexClient', () => {
  let client: FlowIndexClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    client = new FlowIndexClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJsonResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
  }

  describe('getBlock', () => {
    it('fetches latest block when no height given', async () => {
      const block = { height: 100, id: 'abc', timestamp: '2026-01-01T00:00:00Z', tx_count: 5 };
      mockJsonResponse({ data: [block], hasMore: true });
      const result = await client.getBlock();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/block?limit=1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(block);
    });

    it('fetches block by height', async () => {
      const block = { height: 42, id: 'def' };
      mockJsonResponse(block);
      const result = await client.getBlock(42);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/block/42',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(block);
    });
  });

  describe('getTransaction', () => {
    it('fetches a Cadence transaction', async () => {
      const tx = { tx_id: 'abc123', status: 'Sealed' };
      mockJsonResponse(tx);
      const result = await client.getTransaction('abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/transaction/abc123',
        expect.any(Object),
      );
      expect(result).toEqual(tx);
    });
  });

  describe('getEvmTransaction', () => {
    it('fetches an EVM transaction', async () => {
      const tx = { hash: '0xabc', from_address: '0x123' };
      mockJsonResponse(tx);
      const result = await client.getEvmTransaction('0xabc');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/evm/transaction/0xabc',
        expect.any(Object),
      );
      expect(result).toEqual(tx);
    });
  });

  describe('getAccount', () => {
    it('fetches a Flow account', async () => {
      const acct = { address: 'e467b9dd11fa00df', balance: 100 };
      mockJsonResponse(acct);
      const result = await client.getAccount('e467b9dd11fa00df');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/account/e467b9dd11fa00df',
        expect.any(Object),
      );
      expect(result).toEqual(acct);
    });
  });

  describe('getEvmAddress', () => {
    it('fetches an EVM address', async () => {
      const addr = { address: '0x1234abcd', balance: '1000000' };
      mockJsonResponse(addr);
      const result = await client.getEvmAddress('0x1234abcd');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/evm/address/0x1234abcd',
        expect.any(Object),
      );
      expect(result).toEqual(addr);
    });
  });

  describe('search', () => {
    it('searches with query', async () => {
      const results = { results: [{ type: 'account', id: '0x1', title: 'Test' }] };
      mockJsonResponse(results);
      const result = await client.search('FlowToken');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/search?q=FlowToken',
        expect.any(Object),
      );
      expect(result).toEqual(results);
    });
  });

  describe('error handling', () => {
    it('throws FlowIndexApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });
      await expect(client.getBlock(999999999)).rejects.toThrow(FlowIndexApiError);
    });
  });

  describe('getAccountFtHoldings', () => {
    it('fetches FT holdings for an account', async () => {
      const holdings = { data: [{ token_type: 'FlowToken', balance: '100.0' }] };
      mockJsonResponse(holdings);
      const result = await client.getAccountFtHoldings('e467b9dd11fa00df');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/account/e467b9dd11fa00df/ft',
        expect.any(Object),
      );
      expect(result).toEqual(holdings);
    });
  });

  describe('getAccountNftCollections', () => {
    it('fetches NFT collections for an account', async () => {
      const nfts = { data: [{ collection_type: 'TopShot', count: 5 }] };
      mockJsonResponse(nfts);
      const result = await client.getAccountNftCollections('e467b9dd11fa00df');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/account/e467b9dd11fa00df/nft',
        expect.any(Object),
      );
      expect(result).toEqual(nfts);
    });
  });
});
