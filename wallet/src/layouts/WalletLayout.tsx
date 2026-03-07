import { Outlet } from 'react-router-dom';
import { DesktopSidebar, MobileBottomNav } from '../components/Sidebar';

export default function WalletLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <DesktopSidebar />
      <MobileBottomNav />

      {/* Main content area */}
      <main className="md:pl-60 pb-16 md:pb-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
