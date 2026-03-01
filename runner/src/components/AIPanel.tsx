import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Bot, X, Send, Code, ReplaceAll, ChevronLeft, Coins, Image, Search, SendHorizonal, Sparkles, Zap } from 'lucide-react';
import { TEMPLATES, type Template } from '../fs/fileSystem';

const AI_CHAT_URL = import.meta.env.VITE_AI_CHAT_URL || 'https://ai.flowindex.io';

interface AIPanelProps {
  onInsertCode: (code: string) => void;
  onLoadTemplate: (template: Template) => void;
  editorCode?: string;
  network?: string;
}

const PRESET_PROMPTS = [
  { label: 'Create a Fungible Token', icon: Coins, prompt: 'Write a complete Cadence 1.0 Fungible Token contract that implements FungibleToken standard with mint, burn and transfer capabilities.' },
  { label: 'Create an NFT Collection', icon: Image, prompt: 'Write a complete Cadence 1.0 NFT contract that implements NonFungibleToken and MetadataViews standards with mint function and Display view.' },
  { label: 'Query an account balance', icon: Search, prompt: 'Write a Cadence script to query the FLOW token balance of any address using FungibleToken.Balance capability.' },
  { label: 'Send FLOW tokens', icon: SendHorizonal, prompt: 'Write a Cadence transaction to transfer FLOW tokens from the signer to a recipient address.' },
  { label: 'Fix my code', icon: Zap, prompt: 'Please review my current editor code, identify any issues, and provide the fixed version.' },
];

/** Extract code blocks from markdown-like text. Returns segments of text and code. */
function parseCodeBlocks(text: string): Array<{ type: 'text' | 'code'; content: string; lang?: string }> {
  const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', content: match[2].trimEnd(), lang: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.length === 0 ? [{ type: 'text', content: text }] : parts;
}

/** Extract text content from a UIMessage's parts array */
function getMessageText(msg: { parts: Array<{ type: string; text?: string }> }): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
}

export default function AIPanel({ onInsertCode, onLoadTemplate, editorCode, network }: AIPanelProps) {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${AI_CHAT_URL}/api/runner-chat`,
      body: {
        editorCode: editorCode || '',
        network: network || 'mainnet',
      },
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage({ text });
  };

  const handlePresetClick = (prompt: string) => {
    if (isLoading) return;
    sendMessage({ text: prompt });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center w-10 h-full bg-zinc-900 border-l border-zinc-700 hover:bg-zinc-800 transition-colors shrink-0 group"
        title="Open AI Assistant"
      >
        <Bot className="w-5 h-5 text-emerald-500 group-hover:text-emerald-400" />
        <span className="text-[9px] text-zinc-500 group-hover:text-zinc-400 mt-1 font-medium">AI</span>
        <ChevronLeft className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 mt-0.5" />
      </button>
    );
  }

  return (
    <div className="flex flex-col w-80 h-full bg-zinc-900 border-l border-zinc-700 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-200">AI Assistant</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-4 mt-2">
            {/* Welcome */}
            <div className="text-center space-y-1">
              <Sparkles className="w-5 h-5 text-emerald-400 mx-auto" />
              <p className="text-xs text-zinc-300 font-medium">What would you like to build?</p>
              <p className="text-[10px] text-zinc-600">I can see your editor code and help you write Cadence.</p>
            </div>

            {/* Preset prompts */}
            <div className="space-y-1.5">
              {PRESET_PROMPTS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset.prompt)}
                    className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 text-left transition-colors group"
                  >
                    <Icon className="w-3.5 h-3.5 text-emerald-500/70 group-hover:text-emerald-400 shrink-0" />
                    <span className="text-[11px] text-zinc-400 group-hover:text-zinc-200">{preset.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Templates */}
            <div className="pt-2 border-t border-zinc-800">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium mb-2 px-1">Templates</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    onClick={() => onLoadTemplate(template)}
                    className="flex flex-col gap-0.5 px-2 py-1.5 rounded-md bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/30 hover:border-zinc-600 text-left transition-colors"
                    title={template.description}
                  >
                    <span className="text-[10px] text-zinc-300 font-medium leading-tight">{template.label}</span>
                    <span className="text-[9px] text-zinc-600 leading-tight truncate">{template.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => {
          const text = getMessageText(msg);
          if (!text) return null;
          return (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[95%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-700/40 text-zinc-100'
                    : 'bg-zinc-800 text-zinc-200'
                }`}
              >
                {parseCodeBlocks(text).map((part, i) =>
                  part.type === 'code' ? (
                    <div key={i} className="my-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-zinc-500 uppercase">{part.lang || 'code'}</span>
                        <div className="flex items-center gap-2">
                          {(part.lang === 'cadence' || part.lang === 'cdc') && (
                            <button
                              onClick={() => onInsertCode(part.content)}
                              className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                              title="Replace editor content with this code"
                            >
                              <ReplaceAll className="w-3 h-3" />
                              Replace
                            </button>
                          )}
                          <button
                            onClick={() => navigator.clipboard.writeText(part.content)}
                            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            title="Copy to clipboard"
                          >
                            <Code className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                      </div>
                      <pre className="bg-zinc-950 rounded p-2 overflow-x-auto text-[11px] text-zinc-300 font-mono whitespace-pre-wrap">
                        {part.content}
                      </pre>
                    </div>
                  ) : (
                    <span key={i} className="whitespace-pre-wrap">{part.content}</span>
                  )
                )}
              </div>
            </div>
          );
        })}
        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex items-start">
            <div className="bg-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-700 p-2 shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Cadence..."
            className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
