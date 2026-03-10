export function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-12 border-b border-zinc-800/50 bg-black/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl h-full flex items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <span className="inline-block w-2 h-2 rounded-full bg-flow-green" />
          FlowIndex Simulate
        </a>
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <a href="https://docs.flowindex.io" target="_blank" rel="noopener" className="hover:text-zinc-300 transition-colors">
            Docs
          </a>
          <a href="https://github.com/FlowIndex" target="_blank" rel="noopener" className="hover:text-zinc-300 transition-colors">
            GitHub
          </a>
          <a
            href="https://run.flowindex.io"
            target="_blank"
            rel="noopener"
            className="px-3 py-1 border border-zinc-700 rounded text-zinc-300 hover:border-flow-green hover:text-flow-green transition-colors"
          >
            Open Runner →
          </a>
        </div>
      </div>
    </nav>
  )
}
