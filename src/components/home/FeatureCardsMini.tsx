import { Link } from 'react-router-dom';
import { Swords, Wallet, Users, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

const features = [
  { icon: Swords, title: 'Matches', href: '/matches', color: 'text-primary', hoverGlow: 'hover:shadow-glow-blue' },
  { icon: Wallet, title: 'Wallet', href: '/wallet', color: 'text-accent', hoverGlow: 'hover:shadow-glow-gold' },
  { icon: Users, title: 'Teams', href: '/teams', color: 'text-success', hoverGlow: 'hover:shadow-glow-success' },
  { icon: Trophy, title: 'Leaderboard', href: '/leaderboard', color: 'text-yellow-400', hoverGlow: 'hover:shadow-glow-gold' },
];

export function FeatureCardsMini() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {features.map(({ icon: Icon, title, href, color, hoverGlow }) => (
        <Link
          key={title}
          to={href}
          className={cn(
            "flex items-center gap-3 p-3 lg:p-4 rounded-xl",
            "bg-card/60 border border-border/50 backdrop-blur-sm",
            "hover:border-primary/30 hover:bg-card/80 transition-all duration-300",
            "group cursor-pointer",
            hoverGlow
          )}
        >
          <div className={cn(
            "p-2.5 rounded-xl bg-muted/50 transition-all duration-300",
            "group-hover:bg-primary/10 group-hover:scale-110",
            color
          )}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium group-hover:text-primary transition-colors">
            {title}
          </span>
        </Link>
      ))}
    </div>
  );
}
