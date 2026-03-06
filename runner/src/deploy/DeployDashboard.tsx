import { Link, useLocation } from 'react-router-dom';

export default function DeployDashboard() {
  const location = useLocation();

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-zinc-100">
      {/* Top nav */}
      <header className="flex items-center gap-4 px-4 py-2 border-b border-zinc-700 bg-zinc-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm">&#9671;</span>
          <span className="text-sm font-semibold tracking-tight">FlowIndex Runner</span>
        </div>

        <nav className="flex items-center gap-1 ml-4">
          <Link
            to="/editor"
            className="px-3 py-1 text-xs rounded-md transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          >
            Editor
          </Link>
          <Link
            to="/deploy"
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              location.pathname.startsWith('/deploy')
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            Deploy
          </Link>
        </nav>
      </header>

      {/* Main area */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-medium text-zinc-300">Deploy Dashboard</h2>
          <p className="mt-2 text-sm text-zinc-500">Coming soon</p>
        </div>
      </main>
    </div>
  );
}
