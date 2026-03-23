import { useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import solidity from 'react-syntax-highlighter/dist/esm/languages/prism/solidity';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileCode, ChevronDown, ChevronRight } from 'lucide-react';
import { CopyButton } from '@/components/animate-ui/components/buttons/copy';
import { useTheme } from '@/contexts/ThemeContext';
import type { BSSmartContract } from '@/types/blockscout';

SyntaxHighlighter.registerLanguage('solidity', solidity);

interface EVMContractSourceProps {
  contract: BSSmartContract;
}

interface SourceFile {
  name: string;
  code: string;
}

export function EVMContractSource({ contract }: EVMContractSourceProps) {
  const { theme } = useTheme();
  const [showConstructorArgs, setShowConstructorArgs] = useState(false);

  // Build file list: main file first, then additional sources
  const files: SourceFile[] = [];

  if (contract.source_code) {
    const mainName = contract.name ? `${contract.name}.sol` : 'Contract.sol';
    files.push({ name: mainName, code: contract.source_code });
  }

  if (contract.additional_sources) {
    for (const src of contract.additional_sources) {
      files.push({ name: src.file_path, code: src.source_code });
    }
  }

  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const activeFile = files[activeFileIndex] ?? null;

  if (!contract.source_code && (!contract.additional_sources || contract.additional_sources.length === 0)) {
    return (
      <div className="border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark p-8 text-center">
        <FileCode className="h-10 w-10 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-mono">Source code not available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compiler Info Bar */}
      <div className="border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark px-4 py-3 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
        {contract.compiler_version && (
          <span>
            <span className="text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mr-1">Compiler:</span>
            <span className="text-zinc-700 dark:text-zinc-300">{contract.compiler_version}</span>
          </span>
        )}
        {contract.optimization_enabled !== null && (
          <span>
            <span className="text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mr-1">Optimization:</span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {contract.optimization_enabled ? 'Yes' : 'No'}
              {contract.optimization_enabled && contract.optimization_runs !== null
                ? ` (${contract.optimization_runs} runs)`
                : ''}
            </span>
          </span>
        )}
        {contract.evm_version && (
          <span>
            <span className="text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mr-1">EVM Version:</span>
            <span className="text-zinc-700 dark:text-zinc-300">{contract.evm_version}</span>
          </span>
        )}
        {contract.license_type && (
          <span>
            <span className="text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mr-1">License:</span>
            <span className="text-zinc-700 dark:text-zinc-300">{contract.license_type}</span>
          </span>
        )}
      </div>

      {/* File Tabs (shown only when there are multiple files) */}
      {files.length > 1 && (
        <div className="border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark flex overflow-x-auto">
          {files.map((file, index) => (
            <button
              key={index}
              onClick={() => setActiveFileIndex(index)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono whitespace-nowrap border-r border-zinc-200 dark:border-white/10 transition-colors ${
                activeFileIndex === index
                  ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5'
              }`}
            >
              <FileCode className="h-3 w-3 flex-shrink-0" />
              <span className="max-w-[200px] truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Source Code */}
      {activeFile && (
        <div className="border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark overflow-hidden">
          {/* File header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
              <FileCode className="h-3.5 w-3.5" />
              <span>{activeFile.name}</span>
            </div>
            <CopyButton text={activeFile.code} />
          </div>
          <div className="overflow-auto text-sm">
            <SyntaxHighlighter
              language="solidity"
              style={theme === 'dark' ? vscDarkPlus : oneLight}
              showLineNumbers
              lineNumberStyle={{
                minWidth: '3em',
                paddingRight: '1em',
                color: theme === 'dark' ? '#4b5563' : '#9ca3af',
                userSelect: 'none',
              }}
              customStyle={{
                margin: 0,
                background: 'transparent',
                fontSize: '0.8125rem',
                lineHeight: '1.6',
              }}
              codeTagProps={{ style: { fontFamily: 'inherit' } }}
            >
              {activeFile.code}
            </SyntaxHighlighter>
          </div>
        </div>
      )}

      {/* Constructor Arguments */}
      {contract.constructor_args && (
        <div className="border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark overflow-hidden">
          <button
            onClick={() => setShowConstructorArgs((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <span className="uppercase tracking-wider">Constructor Arguments (ABI-encoded)</span>
            {showConstructorArgs ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {showConstructorArgs && (
            <div className="border-t border-zinc-200 dark:border-white/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all leading-relaxed flex-1">
                  {contract.constructor_args}
                </code>
                <CopyButton text={contract.constructor_args} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
