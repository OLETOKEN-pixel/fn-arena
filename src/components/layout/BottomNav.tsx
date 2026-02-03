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
      {/* Glass background with blur */}
      <div className="absolute inset-0 bg-sidebar/95 backdrop-blur-xl border-t border-sidebar-border" />
      
      {/* Gradient accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      
      {/* Nav items */}
      <div className="relative flex items-center justify-around px-2 py-2 safe-area-bottom">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
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
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl min-w-[60px] transition-all duration-200',
                isActive
                  ? 'text-primary'
                  : isLocked
                    ? 'text-muted-foreground/50'
                    : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'relative p-1.5 rounded-lg transition-all duration-200',
                isActive && 'bg-primary/15'
              )}>
                <Icon className={cn(
                  'w-5 h-5 transition-all duration-200',
                  isActive && 'scale-110'
                )} />
                
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
              
              <span className={cn(
                'text-[10px] font-medium',
                isActive && 'font-semibold'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
      
      {/* Safe area padding for devices with home indicator */}
      <style>{`
        .safe-area-bottom {
          padding-bottom: max(8px, env(safe-area-inset-bottom));
        }
      `}</style>
    </nav>
  );
}