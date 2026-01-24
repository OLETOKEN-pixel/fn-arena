import { Swords, Wallet, Users, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

const features = [
  { icon: Swords, title: 'Matches', color: 'text-accent' },
  { icon: Wallet, title: 'Wallet', color: 'text-primary' },
  { icon: Users, title: 'Teams', color: 'text-secondary-foreground' },
  { icon: Trophy, title: 'Leaderboard', color: 'text-accent' },
];

export function FeatureCardsMini() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {features.map(({ icon: Icon, title, color }) => (
        <div
          key={title}
          className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 transition-colors"
        >
          <div className={cn('p-2 rounded-lg bg-muted', color)}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
      ))}
    </div>
  );
}
