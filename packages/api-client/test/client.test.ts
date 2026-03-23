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
      mockJsonResponse({ data: [block], _meta: { count: 1, limit: 1, offset: 0 } });
      const result = await client.getBlock();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flowindex.io/api/flow/block?limit=1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(block);
    });

    it('fetches block by height (returns data array)', async () => {
      const block = { height: 42, id: 'def', timestamp: '2026-01-01T00:00:00Z', tx_count: 2 };
      mockJsonResponse({ data: [block] });
      const result = await client.getBlock(42);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flowindex.io/api/flow/block/42',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(block);
    });

    it('throws 404 when block by height returns empty data', async () => {
      mockJsonResponse({ data: [] });
      await expect(client.getBlock(999999999)).rejects.toThrow(FlowIndexApiError);
    });
  });

  describe('getTransaction', () => {
    it('fetches a Cadence transaction (returns data array)', async () => {
      const tx = {
        id: 'abc123',
        status: 'SEALED',
        block_height: 100,
        timestamp: '2026-01-01T00:00:00Z',
        fee: 0.001,
        proposer: '0x1234',
        payer: '0x1234',
        authorizers: ['0x1234'],
        error: '',
        event_count: 3,
        events: [],
        transfer_summary: { ft: [], nft: [] },
      };
      mockJsonResponse({ data: [tx] });
      const result = await client.getTransaction('abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flowindex.io/api/flow/transaction?id=abc123',
        expect.any(Object),
      );
      expect(result).toEqual(tx);
    });

    it('throws 404 when transaction not found', async () => {
      mockJsonResponse({ data: [] });
      await expect(client.getTransaction('nonexistent')).rejects.toThrow(FlowIndexApiError);
    });
  });

  describe('getEvmTransaction', () => {
    it('fetches an EVM transaction', async () => {
      const tx = { hash: '0xabc', from_address: '0x123' };
      mockJsonResponse(tx);
      const result = await client.getEvmTransaction('0xabc');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flowindex.io/api/flow/evm/transaction/0xabc',
        expect.any(Object),
      );
      expect(result).toEqual(tx);
    });
  });

  describe('getAccount', () => {
    it('fetches a Flow account (returns data array)', async () => {
      const acct = {
        address: '0xe467b9dd11fa00df',
        flowBalance: 2342.07115664,
        flowStorage: 183220.93,
        contracts: ['FlowToken', 'EVM'],
        keys: [
          {
            index: '0',
            key: 'dfd3ae...',
            signatureAlgorithm: 'ECDSA_secp256k1',
            hashAlgorithm: 'SHA2_256',
            weight: 1000,
            revoked: false,
          },
        ],
      };
      mockJsonResponse({ data: [acct] });
      const result = await client.getAccount('e467b9dd11fa00df');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flowindex.io/api/flow/account/e467b9dd11fa00df',
        expect.any(Object),
      );
      expect(result).toEqual(acct);
    });

    it('throws 404 when account not found', async () => {
      mockJsonResponse({ data: [] });
      await expect(client.getAccount('0000000000000000')).rejects.toThrow(FlowIndexApiError);
    });
  });

  describe('getEvmAddress', () => {
    it('fetches an EVM address', async () => {
      const addr = { address: '0x1234abcd', balance: '1000000' };
      mockJsonResponse(addr);
      const result = await client.getEvmAddress('0x1234abcd');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flowindex.io/api/flow/evm/address/0x1234abcd',
        expect.any(Object),
      );
      expect(result).toEqual(addr);
    });
  });

  describe('search', () => {
    it('searches and returns contracts and tokens', async () => {
      const response = {
        data: {
          contracts: [{ address: '1654653399040a61', name: 'FlowToken', kind: 'FT', dependent_count: 77853 }],
          tokens: [{ address: '1654653399040a61', contract_name: 'FlowToken', name: 'FLOW Network Token', symbol: 'FLOW' }],
        },
      };
      mockJsonResponse(response);
      const result = await client.search('FlowToken');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flowindex.io/api/flow/search?q=FlowToken',
        expect.any(Object),
      );
      expect(result).toEqual(response);
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
        'https://flowindex.io/api/flow/account/e467b9dd11fa00df/ft',
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
        'https://flowindex.io/api/flow/account/e467b9dd11fa00df/nft',
        expect.any(Object),
      );
      expect(result).toEqual(nfts);
    });
  });
});
