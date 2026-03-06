import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const App = lazy(() => import('./App'));
const DeployDashboard = lazy(() => import('./deploy/DeployDashboard'));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-zinc-900">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  );
}

export default function Router() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/editor" element={<App />} />
          <Route path="/deploy/*" element={<DeployDashboard />} />
          <Route path="*" element={<Navigate to="/editor" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
