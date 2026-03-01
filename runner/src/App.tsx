import { useState, useEffect, useCallback } from 'react';
import CadenceEditor from './editor/CadenceEditor';
import { configureFcl } from './flow/fclConfig';
import type { FlowNetwork } from './flow/networks';

const DEFAULT_CODE = `// Welcome to Cadence Runner
// Press Ctrl/Cmd+Enter to execute

access(all) fun main(): String {
    return "Hello, Flow!"
}
`;

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [network, setNetwork] = useState<FlowNetwork>('mainnet');

  useEffect(() => {
    configureFcl(network);
  }, [network]);

  const handleRun = useCallback(() => {
    // Will be implemented in Task 4
    console.log('Run triggered for network:', network);
  }, [network]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 bg-zinc-900/80 backdrop-blur shrink-0">
        <h1 className="text-sm font-semibold tracking-tight">
          Cadence Runner
        </h1>
        <div className="flex items-center gap-3">
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as FlowNetwork)}
            className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
          </select>
        </div>
      </header>

      {/* Editor */}
      <main className="flex-1 min-h-0">
        <CadenceEditor
          code={code}
          onChange={setCode}
          onRun={handleRun}
          darkMode={true}
        />
      </main>
    </div>
  );
}
