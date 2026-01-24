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
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Swords, label: 'Live Matches', href: '/matches' },
  { icon: Play, label: 'Highlights', href: '/highlights' },
  { icon: Trophy, label: 'Challenges', href: '/challenges', requiresAuth: true },
  { icon: Gamepad2, label: 'My Matches', href: '/my-matches', requiresAuth: true },
  { icon: Medal, label: 'Leaderboard', href: '/leaderboard' },
  { icon: Users, label: 'Teams', href: '/teams', requiresAuth: true },
  { icon: Wallet, label: 'Wallet', href: '/wallet', requiresAuth: true },
  { icon: User, label: 'Profile', href: '/profile', requiresAuth: true },
  { icon: Shield, label: 'Admin', href: '/admin', requiresAdmin: true },
];

export function Sidebar() {
  const location = useLocation();
  const { user, profile } = useAuth();

  const isAdmin = profile?.role === 'admin';

  // Show all items except Admin (unless admin)
  const displayNavItems = navItems.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    return true;
  });

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-20 lg:w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo - Cliccabile */}
      <Link 
        to="/" 
        className="flex items-center justify-center lg:justify-start gap-3 px-4 h-16 border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-all duration-200"
      >
        <img 
          src={logoOleboy} 
          alt="OLEBOY TOKEN" 
          className="w-10 h-10 object-contain"
        />
        <span className="hidden lg:block font-display font-bold text-lg text-foreground">
          OLEBOY <span className="text-accent">TOKEN</span>
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3">
        <ul className="space-y-2">
          {displayNavItems.map((item) => {
            const isActive = location.pathname === item.href;
            const isLocked = item.requiresAuth && !user;
            const Icon = item.icon;
            
            // If locked, link to auth with redirect
            const href = isLocked 
              ? `/auth?next=${encodeURIComponent(item.href)}` 
              : item.href;

            return (
              <li key={item.href}>
                <Link
                  to={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200',
                    'hover:bg-sidebar-accent group',
                    isActive && !isLocked
                      ? 'bg-primary/10 text-primary glow-blue' 
                      : isLocked 
                        ? 'text-muted-foreground/60 opacity-70'
                        : 'text-sidebar-foreground'
                  )}
                >
                  <Icon className={cn(
                    'w-5 h-5 shrink-0',
                    isActive && !isLocked 
                      ? 'text-primary' 
                      : isLocked
                        ? 'text-muted-foreground/50'
                        : 'text-muted-foreground group-hover:text-foreground'
                  )} />
                  <span className={cn(
                    'hidden lg:block font-medium',
                    isActive && !isLocked && 'text-primary',
                    isLocked && 'text-muted-foreground/60'
                  )}>
                    {item.label}
                  </span>
                  {isLocked && (
                    <Lock className="hidden lg:block ml-auto w-4 h-4 text-muted-foreground/50" />
                  )}
                  {isActive && !isLocked && (
                    <div className="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Quick Actions - Premium Buttons */}
      <div className="p-3 border-t border-sidebar-border space-y-3">
        <Link
          to={user ? "/matches/create" : "/auth?next=/matches/create"}
          className={cn(
            "group relative flex items-center justify-center lg:justify-start gap-2 px-4 py-3 rounded-xl font-semibold transition-all duration-300 overflow-hidden",
            "bg-gradient-to-r from-primary via-primary to-primary/80 text-primary-foreground",
            "hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/30",
            "active:scale-[0.98]",
            "border border-primary/30",
            user ? "" : "opacity-80"
          )}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <Plus className="w-5 h-5 relative z-10" />
          <span className="hidden lg:block relative z-10">Create Match</span>
          {!user && <Lock className="hidden lg:block ml-auto w-4 h-4 opacity-50 relative z-10" />}
        </Link>
        
        <Link
          to={user ? "/buy" : "/auth?next=/buy"}
          className={cn(
            "group relative flex items-center justify-center lg:justify-start gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-300 overflow-hidden",
            "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black",
            "hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/40",
            "active:scale-[0.98]",
            "border border-amber-400/50",
            user ? "" : "opacity-80"
          )}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <CoinIcon size="sm" />
          <span className="hidden lg:block relative z-10">Buy Coins</span>
          {!user && <Lock className="hidden lg:block ml-auto w-4 h-4 opacity-50 relative z-10" />}
        </Link>
      </div>
    </aside>
  );
}
