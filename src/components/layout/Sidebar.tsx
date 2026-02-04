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

  // Filter items based on permissions
  const displayNavItems = navItems.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    return true;
  });

  // Group items
  const groupedItems = displayNavItems.reduce((acc, item) => {
    const group = item.group || 'core';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <aside 
      className="fixed left-0 top-0 z-40 h-screen w-20 lg:w-64 bg-sidebar border-r border-sidebar-border flex flex-col"
      style={{ '--sidebar-width': '256px' } as React.CSSProperties}
    >
      {/* Logo */}
      <Link 
        to="/" 
        className="flex items-center justify-center lg:justify-start gap-3 px-4 h-16 border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-all duration-200 group"
      >
        <img 
          src={logoOleboy} 
          alt="OLEBOY TOKEN" 
          className="w-11 h-11 object-contain transition-transform duration-200 group-hover:scale-105"
        />
        <span className="hidden lg:block font-display font-bold text-xl tracking-tight">
          <span className="text-foreground">OLEBOY</span>
          <span className="text-accent ml-1.5">TOKEN</span>
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto scrollbar-thin">
        {['core', 'social', 'account'].map((group, groupIndex) => {
          const items = groupedItems[group];
          if (!items || items.length === 0) return null;

          return (
            <div key={group} className={cn(groupIndex > 0 && "mt-6")}>
              {/* Group Label - Desktop only */}
              <div className="hidden lg:block px-3 pb-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
                  {groupLabels[group]}
                </span>
              </div>
              
              <ul className="space-y-1">
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
                          'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative',
                          isActive && !isLocked
                            ? 'bg-gradient-to-r from-primary/20 to-primary/5 text-primary shadow-[0_0_20px_rgba(79,142,255,0.15)]' 
                            : isLocked 
                              ? 'text-muted-foreground/40 hover:text-muted-foreground/60'
                              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
                        )}
                      >
                        {/* Active indicator */}
                        {isActive && !isLocked && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_8px_rgba(79,142,255,0.5)]" />
                        )}
                        
                        <Icon className={cn(
                          'w-5 h-5 shrink-0 transition-all duration-200',
                          isActive && !isLocked 
                            ? 'text-primary' 
                            : isLocked
                              ? 'text-muted-foreground/30'
                              : 'group-hover:text-foreground group-hover:scale-110'
                        )} />
                        <span className={cn(
                          'hidden lg:block font-medium text-sm',
                          isActive && !isLocked && 'text-primary font-semibold'
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
      <div className="p-3 border-t border-sidebar-border space-y-2.5">
        <Link
          to={user ? "/matches/create" : "/auth?next=/matches/create"}
          className={cn(
            "group relative flex items-center justify-center lg:justify-start gap-2.5 px-4 py-3 rounded-xl font-semibold transition-all duration-300 overflow-hidden",
            "bg-gradient-to-r from-primary via-primary to-primary/80 text-primary-foreground",
            "hover:shadow-[0_0_25px_rgba(79,142,255,0.4)] hover:-translate-y-0.5",
            "active:scale-[0.98]",
            "border border-primary/30",
            user ? "" : "opacity-80"
          )}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <Plus className="w-5 h-5 relative z-10" />
          <span className="hidden lg:block relative z-10 text-sm">Create Match</span>
          {!user && <Lock className="hidden lg:block ml-auto w-3.5 h-3.5 opacity-50 relative z-10" />}
        </Link>
        
        <Link
          to={user ? "/buy" : "/auth?next=/buy"}
          className={cn(
            "group relative flex items-center justify-center lg:justify-start gap-2.5 px-4 py-3 rounded-xl font-bold transition-all duration-300 overflow-hidden",
            "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black",
            "hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:-translate-y-0.5",
            "active:scale-[0.98]",
            "border border-amber-400/50",
            user ? "" : "opacity-80"
          )}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <CoinIcon size="sm" />
          <span className="hidden lg:block relative z-10 text-sm">Buy Coins</span>
          {!user && <Lock className="hidden lg:block ml-auto w-3.5 h-3.5 opacity-50 relative z-10" />}
        </Link>
      </div>
    </aside>
  );
}
