import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Swords, 
  Gamepad2,
  Users, 
  Wallet, 
  User, 
  Shield,
  Plus,
  Lock,
  Play,
  Trophy,
  Medal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import logoOleboy from '@/assets/logo-oleboy.png';
import { CoinIcon } from '@/components/common/CoinIcon';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  group?: 'core' | 'social' | 'account';
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', href: '/', group: 'core' },
  { icon: Swords, label: 'Live Matches', href: '/matches', group: 'core' },
  { icon: Gamepad2, label: 'My Matches', href: '/my-matches', requiresAuth: true, group: 'core' },
  { icon: Trophy, label: 'Challenges', href: '/challenges', requiresAuth: true, group: 'social' },
  { icon: Play, label: 'Highlights', href: '/highlights', group: 'social' },
  { icon: Medal, label: 'Leaderboard', href: '/leaderboard', group: 'social' },
  { icon: Users, label: 'Teams', href: '/teams', requiresAuth: true, group: 'social' },
  { icon: Wallet, label: 'Wallet', href: '/wallet', requiresAuth: true, group: 'account' },
  { icon: User, label: 'Profile', href: '/profile', requiresAuth: true, group: 'account' },
  { icon: Shield, label: 'Admin', href: '/admin', requiresAdmin: true, group: 'account' },
];

const groupLabels: Record<string, string> = {
  core: 'Core',
  social: 'Discover',
  account: 'Account',
};

export function Sidebar() {
  const location = useLocation();
  const { user, profile } = useAuth();

  const isAdmin = profile?.role === 'admin';

  const displayNavItems = navItems.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    return true;
  });

  const groupedItems = displayNavItems.reduce((acc, item) => {
    const group = item.group || 'core';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <aside 
      className="fixed left-0 top-0 z-40 h-screen w-20 lg:w-[300px] bg-sidebar border-r border-sidebar-border flex flex-col"
      style={{ '--sidebar-width': '300px' } as React.CSSProperties}
    >
      {/* Logo */}
      <Link 
        to="/" 
        className="flex items-center justify-center lg:justify-start gap-4 px-5 h-[72px] border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-all duration-200 group"
      >
        <img 
          src={logoOleboy} 
          alt="OLEBOY TOKEN" 
          className="w-10 h-10 object-contain transition-transform duration-200 group-hover:scale-105"
        />
        <span className="hidden lg:block font-display font-bold text-xl tracking-tight">
          <span className="text-foreground">OLEBOY</span>
          <span className="text-accent ml-2">TOKEN</span>
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto scrollbar-thin">
        {['core', 'social', 'account'].map((group, groupIndex) => {
          const items = groupedItems[group];
          if (!items || items.length === 0) return null;

          return (
            <div key={group} className={cn(groupIndex > 0 && "mt-6")}>
              <div className="hidden lg:block px-3 pb-2">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-medium">
                  {groupLabels[group]}
                </span>
              </div>
              
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const isActive = location.pathname === item.href;
                  const isLocked = item.requiresAuth && !user;
                  const Icon = item.icon;
                  
                  const href = isLocked 
                    ? `/auth?next=${encodeURIComponent(item.href)}` 
                    : item.href;

                  return (
                    <li key={item.href}>
                      <Link
                        to={href}
                        className={cn(
                          'flex items-center gap-3.5 px-3 py-2.5 rounded-lg transition-all duration-150 group relative',
                          isActive && !isLocked
                            ? 'bg-white/[0.06] text-foreground' 
                            : isLocked 
                              ? 'text-muted-foreground/40 hover:text-muted-foreground/60'
                              : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground'
                        )}
                      >
                        {/* Active indicator — solid cyan bar */}
                        {isActive && !isLocked && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r bg-primary" />
                        )}
                        
                        <Icon className={cn(
                          'w-5 h-5 shrink-0 transition-colors duration-150',
                          isActive && !isLocked 
                            ? 'text-primary' 
                            : isLocked
                              ? 'text-muted-foreground/30'
                              : 'group-hover:text-foreground'
                        )} />
                        <span className={cn(
                          'hidden lg:block text-sm',
                          isActive && !isLocked && 'text-foreground font-medium'
                        )}>
                          {item.label}
                        </span>
                        {isLocked && (
                          <Lock className="hidden lg:block ml-auto w-3.5 h-3.5 text-muted-foreground/30" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Quick Actions */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <Link
          to={user ? "/matches/create" : "/auth?next=/matches/create"}
          className={cn(
            "group flex items-center justify-center lg:justify-start gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200",
            "bg-primary/10 text-primary border border-primary/20",
            "hover:bg-primary/15 hover:border-primary/30",
            "active:scale-[0.98]",
            user ? "" : "opacity-70"
          )}
        >
          <Plus className="w-5 h-5" />
          <span className="hidden lg:block">Create Match</span>
          {!user && <Lock className="hidden lg:block ml-auto w-3.5 h-3.5 opacity-50" />}
        </Link>
        
        <Link
          to={user ? "/buy" : "/auth?next=/buy"}
          className={cn(
            "group flex items-center justify-center lg:justify-start gap-3 px-4 py-3 rounded-lg font-bold text-sm transition-all duration-200",
            "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black",
            "hover:shadow-glow-gold",
            "active:scale-[0.98]",
            user ? "" : "opacity-70"
          )}
        >
          <CoinIcon size="sm" />
          <span className="hidden lg:block">Buy Coins</span>
          {!user && <Lock className="hidden lg:block ml-auto w-3.5 h-3.5 opacity-50" />}
        </Link>
      </div>
    </aside>
  );
}
