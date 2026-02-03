import { Trophy, Users, Zap } from 'lucide-react';
import { CoinIcon } from '@/components/common/CoinIcon';
import { cn } from '@/lib/utils';

interface StatPillProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
}

function StatPill({ icon, value, label, className }: StatPillProps) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 lg:p-4 rounded-xl",
      "bg-card/80 border border-border/50 backdrop-blur-sm",
      "hover:border-primary/30 hover:bg-card transition-all duration-300",
      "card-hover group",
      className
    )}>
      <div className="p-2 rounded-lg bg-secondary/50 group-hover:bg-primary/10 transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-lg lg:text-xl font-bold font-mono leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export function StatsBar() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-2">
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
