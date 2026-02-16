import { Link, useLocation } from 'react-router-dom';
import { Home, Swords, Gamepad2, Wallet, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  requiresAuth?: boolean;
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Swords, label: 'Matches', href: '/matches' },
  { icon: Gamepad2, label: 'My Games', href: '/my-matches', requiresAuth: true },
  { icon: Wallet, label: 'Wallet', href: '/wallet', requiresAuth: true },
  { icon: User, label: 'Profile', href: '/profile', requiresAuth: true },
];

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      {/* Solid dark background */}
      <div className="absolute inset-0 bg-[hsl(245_40%_7%/0.95)] backdrop-blur-[8px] border-t border-white/[0.04]" />
      
      {/* Nav items */}
      <div className="relative flex items-center justify-around px-1 py-1.5 safe-area-bottom">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href !== '/' && location.pathname.startsWith(item.href));
          const isLocked = item.requiresAuth && !user;
          const Icon = item.icon;
          
          const href = isLocked 
            ? `/auth?next=${encodeURIComponent(item.href)}` 
            : item.href;

          return (
            <Link
              key={item.href}
              to={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg min-w-[64px] transition-all duration-150',
                isActive
                  ? 'text-primary'
                  : isLocked
                    ? 'text-muted-foreground/40'
                    : 'text-muted-foreground hover:text-foreground active:scale-95'
              )}
            >
              <div className={cn(
                'relative p-1.5 rounded-lg transition-all duration-200',
                isActive && 'bg-primary/10'
              )}>
                <Icon className={cn(
                  'w-5 h-5 transition-all duration-150',
                  isActive && 'scale-105'
                )} />
                
                {/* Active dot — clean */}
                {isActive && (
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
              
              <span className={cn(
                'text-[10px] font-medium',
                isActive && 'font-semibold text-primary'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
      
      <style>{`
        .safe-area-bottom {
          padding-bottom: max(8px, env(safe-area-inset-bottom));
        }
      `}</style>
    </nav>
  );
}
