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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  { icon: Gamepad2, label: 'My Matches', href: '/my-matches', requiresAuth: true },
  { icon: Trophy, label: 'Challenges', href: '/challenges', requiresAuth: true },
  { icon: Play, label: 'Highlights', href: '/highlights' },
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

  const displayNavItems = navItems.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    return true;
  });

  return (
    <aside 
      className="fixed left-0 top-0 z-40 h-screen w-20 bg-sidebar border-r border-sidebar-border flex flex-col items-center"
    >
      {/* Logo */}
      <Link 
        to="/" 
        className="flex items-center justify-center w-full h-[72px] border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-all duration-200 group"
      >
        <img 
          src={logoOleboy} 
          alt="OLEBOY TOKEN" 
          className="w-10 h-10 object-contain transition-transform duration-200 group-hover:scale-105"
        />
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto scrollbar-thin w-full">
        <ul className="flex flex-col items-center gap-1">
          {displayNavItems.map((item) => {
            const isActive = location.pathname === item.href;
            const isLocked = item.requiresAuth && !user;
            const Icon = item.icon;
            
            const href = isLocked 
              ? `/auth?next=${encodeURIComponent(item.href)}` 
              : item.href;

            return (
              <li key={item.href}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={href}
                      className={cn(
                        'flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-150',
                        isActive && !isLocked
                          ? 'bg-primary/15 text-primary' 
                          : isLocked 
                            ? 'text-muted-foreground/40 hover:text-muted-foreground/60'
                            : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
                      )}
                    >
                      <Icon className={cn(
                        'w-5 h-5 transition-colors duration-150',
                        isActive && !isLocked && 'text-primary',
                        isLocked && 'text-muted-foreground/30'
                      )} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <span className="flex items-center gap-2">
                      {item.label}
                      {isLocked && <Lock className="w-3 h-3 opacity-50" />}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Quick Actions */}
      <div className="p-2 border-t border-sidebar-border space-y-2 w-full flex flex-col items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={user ? "/matches/create" : "/auth?next=/matches/create"}
              className={cn(
                "flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200",
                "bg-primary/10 text-primary border border-primary/20",
                "hover:bg-primary/15 hover:border-primary/30",
                "active:scale-[0.98]",
                !user && "opacity-70"
              )}
            >
              <Plus className="w-5 h-5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>Create Match</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={user ? "/buy" : "/auth?next=/buy"}
              className={cn(
                "flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200",
                "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black font-bold",
                "hover:shadow-glow-gold",
                "active:scale-[0.98]",
                !user && "opacity-70"
              )}
            >
              <CoinIcon size="sm" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>Buy Coins</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
