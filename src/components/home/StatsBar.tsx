import { Trophy, Users, Zap } from 'lucide-react';
import { CoinIcon } from '@/components/common/CoinIcon';

interface StatPillProps {
  icon: React.ReactNode;
  value: string;
  label: string;
}

function StatPill({ icon, value, label }: StatPillProps) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors">
      <div className="text-primary">{icon}</div>
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function StatsBar() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-3">
      <StatPill 
        icon={<Trophy className="w-5 h-5 text-accent" />} 
        value="1,234" 
        label="Matches" 
      />
      <StatPill 
        icon={<CoinIcon size="sm" />} 
        value="€50K+" 
        label="Won" 
      />
      <StatPill 
        icon={<Users className="w-5 h-5 text-success" />} 
        value="500+" 
        label="Players" 
      />
      <StatPill 
        icon={<Zap className="w-5 h-5 text-primary" />} 
        value="24/7" 
        label="Active" 
      />
    </div>
  );
}
