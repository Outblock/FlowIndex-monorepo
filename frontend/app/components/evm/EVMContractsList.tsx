import { useState, useEffect, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { Search, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { getEVMSmartContracts, getEVMSmartContractCounters } from '@/api/evm';
import { formatWei, truncateHash } from '@/lib/evmUtils';
import { CursorPagination } from './CursorPagination';
import type { BSSmartContractListItem, BSSmartContractCounters, BSPageParams } from '@/types/blockscout';

interface EVMContractsListProps {
  initialQuery?: string;
}

export function EVMContractsList({ initialQuery = '' }: EVMContractsListProps) {
  const [contracts, setContracts] = useState<BSSmartContractListItem[]>([]);
  const [counters, setCounters] = useState<BSSmartContractCounters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState('');
  const [nextPageParams, setNextPageParams] = useState<BSPageParams | null>(null);
  const [pageStack, setPageStack] = useState<(BSPageParams | null)[]>([]);
  const [currentPageParams, setCurrentPageParams] = useState<BSPageParams | null>(null);

  const fetchContracts = useCallback(async (pageParams?: BSPageParams | null) => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (query) params.q = query;
      if (sortBy) params.sort = sortBy;
      if (pageParams) {
        Object.entries(pageParams).forEach(([k, v]) => { params[k] = String(v); });
      }
      const res = await getEVMSmartContracts(params);
      setContracts(res.items || []);
      setNextPageParams(res.next_page_params);
    } catch (e) {
      console.error('Failed to load EVM contracts', e);
      setError('Failed to load EVM contracts. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [query, sortBy]);

  // Initial load + counters
  useEffect(() => {
    fetchContracts();
    getEVMSmartContractCounters().then(setCounters).catch(() => {});
  }, [fetchContracts]);

  const handleNext = () => {
    if (!nextPageParams) return;
    setPageStack(prev => [...prev, currentPageParams]);
    setCurrentPageParams(nextPageParams);
    fetchContracts(nextPageParams);
  };

  const handlePrev = () => {
    if (pageStack.length === 0) return;
    const prev = [...pageStack];
    const prevParams = prev.pop()!;
    setPageStack(prev);
    setCurrentPageParams(prevParams);
    fetchContracts(prevParams);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(searchInput.trim());
    setPageStack([]);
    setCurrentPageParams(null);
  };

  const handleSort = (col: string) => {
    setSortBy(prev => prev === col ? `-${col}` : col);
    setPageStack([]);
    setCurrentPageParams(null);
  };

  const totalContracts = counters ? parseInt(counters.smart_contracts, 10) : 0;
  const verifiedContracts = counters ? parseInt(counters.verified_smart_contracts, 10) : 0;

  return (
    <div className="space-y-6">
      {/* Search */}
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onSubmit={handleSearch}
        className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 p-4 rounded-sm shadow-sm dark:shadow-none flex items-center gap-3"
      >
        <div className="flex items-center gap-2 text-zinc-500">
          <Search className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-widest font-semibold">Filter</span>
        </div>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search by contract name or address"
          className="flex-1 bg-transparent border border-zinc-200 dark:border-white/10 px-3 py-2 rounded-sm text-sm font-mono text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-nothing-green/30"
        />
        <button
          type="submit"
          className="px-4 py-2 border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/30 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-sm text-xs uppercase tracking-widest font-semibold text-zinc-700 dark:text-zinc-200 transition-colors"
        >
          Apply
        </button>
      </motion.form>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-6"
      >
        <div className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 p-6 rounded-sm shadow-sm dark:shadow-none">
          <p className="text-xs text-zinc-500 dark:text-gray-400 uppercase tracking-widest mb-1">Total Contracts</p>
          <p className="text-3xl font-bold font-mono text-zinc-900 dark:text-white">
            <NumberFlow value={totalContracts} format={{ useGrouping: true }} />
          </p>
        </div>
        <div className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 p-6 rounded-sm shadow-sm dark:shadow-none">
          <p className="text-xs text-zinc-500 dark:text-gray-400 uppercase tracking-widest mb-1">Verified Contracts</p>
          <p className="text-3xl font-bold font-mono text-zinc-900 dark:text-white">
            <NumberFlow value={verifiedContracts} format={{ useGrouping: true }} />
          </p>
        </div>
      </motion.div>

      {/* Table */}
      <div className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 rounded-sm overflow-hidden shadow-sm dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5">
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider">Contract</th>
                <th
                  className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-right cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                  onClick={() => handleSort('balance')}
                >
                  Balance {sortBy === 'balance' ? '↑' : sortBy === '-balance' ? '↓' : ''}
                </th>
                <th
                  className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-right cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                  onClick={() => handleSort('txs')}
                >
                  Txs {sortBy === 'txs' ? '↑' : sortBy === '-txs' ? '↓' : ''}
                </th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider">Language / Compiler</th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-center">Settings</th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-center">Verified</th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider">License</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-zinc-500 text-sm">Loading EVM contracts...</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="p-8 text-center text-amber-600 dark:text-amber-400 text-sm">{error}</td></tr>
              ) : contracts.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-zinc-500 text-sm">No contracts found</td></tr>
              ) : (
                <AnimatePresence mode="popLayout">
                  {contracts.map((c) => {
                    const addr = c.address?.hash || '';
                    const shortAddr = truncateHash(addr, 8, 6);
                    const balance = c.coin_balance ? formatWei(c.coin_balance) : '0';
                    const compiler = c.compiler_version ? c.compiler_version.replace(/^v/, '') : '';
                    const lang = c.language || '';

                    return (
                      <motion.tr
                        layout
                        key={addr}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="border-b border-zinc-100 dark:border-white/5 group hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            <Link
                              to={"/contracts/evm/$address" as any}
                              params={{ address: addr } as any}
                              className="font-mono text-sm text-zinc-900 dark:text-white hover:underline font-medium"
                            >
                              {c.name || 'Unnamed'}
                            </Link>
                            <span className="font-mono text-xs text-zinc-500">{shortAddr}</span>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <span className="font-mono text-sm text-zinc-900 dark:text-white">{balance}</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="font-mono text-sm text-zinc-900 dark:text-white">{(c.tx_count || 0).toLocaleString()}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            {lang && <span className="text-sm text-zinc-900 dark:text-white">{lang}</span>}
                            {compiler && <span className="text-xs text-zinc-500 font-mono">{compiler}</span>}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {c.optimization_enabled ? (
                            <span className="text-xs text-emerald-500" title="Optimization enabled">Opt</span>
                          ) : (
                            <span className="text-xs text-zinc-400">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {c.is_verified ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 inline-block" />
                          ) : (
                            <XCircle className="w-4 h-4 text-zinc-400 inline-block" />
                          )}
                        </td>
                        <td className="p-4">
                          <span className="text-xs text-zinc-500">{c.license_type || '\u2014'}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-white/5">
          <CursorPagination
            nextPageParams={nextPageParams}
            hasPrev={pageStack.length > 0}
            isLoading={loading}
            onNext={handleNext}
            onPrev={handlePrev}
          />
        </div>
      </div>
    </div>
  );
}
