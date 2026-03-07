import { NavLink } from 'react-router-dom';
import { Home, Image, Send, Activity, Settings } from 'lucide-react';
import { cn } from '@flowindex/flow-ui';
import AccountSwitcher from './AccountSwitcher';
import NetworkBadge from './NetworkBadge';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/nfts', label: 'NFTs', icon: Image },
  { to: '/send', label: 'Send', icon: Send },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Desktop sidebar (hidden on mobile) */
export function DesktopSidebar() {
  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0 bg-zinc-950 border-r border-zinc-800/60">
      {/* Branding */}
      <div className="px-4 py-5 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-nothing-green/20 flex items-center justify-center">
          <span className="text-nothing-green font-bold text-sm">FI</span>
        </div>
        <span className="text-zinc-100 font-semibold text-lg tracking-tight">FlowIndex</span>
      </div>

      {/* Account switcher */}
      <div className="px-2 mb-2">
        <AccountSwitcher />
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-nothing-green/10 text-nothing-green'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              )
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Network badge at bottom */}
      <div className="px-2 pb-4 pt-2 border-t border-zinc-800/60 mt-auto">
        <NetworkBadge />
      </div>
    </aside>
  );
}

/** Mobile bottom navigation bar (hidden on desktop) */
export function MobileBottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-zinc-950 border-t border-zinc-800/60 flex items-center justify-around px-2 py-1 safe-bottom">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors min-w-[48px]',
              isActive
                ? 'text-nothing-green'
                : 'text-zinc-500 hover:text-zinc-300',
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
