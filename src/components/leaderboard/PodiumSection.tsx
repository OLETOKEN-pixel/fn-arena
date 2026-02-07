import { useState, useEffect, useRef } from 'react';
import { Trophy, Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import type { LeaderboardEntry } from '@/types';
import { cn } from '@/lib/utils';

interface PodiumSectionProps {
  entries: LeaderboardEntry[];
  onSelectUser: (userId: string) => void;
}

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || target === 0) return;
    started.current = true;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

function PodiumCard({ entry, rank, onSelect }: { entry: LeaderboardEntry; rank: number; onSelect: () => void }) {
  const wins = useCountUp(entry.wins, 1400);
  const earnings = useCountUp(Math.round(Number(entry.total_earnings) * 100), 1600) / 100;

  const configs = {
    1: {
      size: 'w-24 h-24',
      cardClass: 'podium-gold',
      gradient: 'from-yellow-500/20 via-amber-500/10 to-yellow-600/5',
      ring: 'ring-yellow-400/60',
      glow: 'shadow-[0_0_40px_hsl(45_95%_55%/0.3),0_0_80px_hsl(45_95%_55%/0.1)]',
      label: '1ST',
      labelBg: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black',
      delay: '0.3s',
      zIndex: 'z-20',
      mt: 'mt-0',
    },
    2: {
      size: 'w-20 h-20',
      cardClass: 'podium-silver',
      gradient: 'from-gray-300/15 via-gray-400/5 to-gray-500/5',
      ring: 'ring-gray-300/50',
      glow: 'shadow-[0_0_25px_hsl(220_10%_70%/0.2)]',
      label: '2ND',
      labelBg: 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-900',
      delay: '0.5s',
      zIndex: 'z-10',
      mt: 'mt-8',
    },
    3: {
      size: 'w-20 h-20',
      cardClass: 'podium-bronze',
      gradient: 'from-amber-600/15 via-amber-700/5 to-orange-800/5',
      ring: 'ring-amber-600/50',
      glow: 'shadow-[0_0_25px_hsl(30_80%_45%/0.2)]',
      label: '3RD',
      labelBg: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white',
      delay: '0.7s',
      zIndex: 'z-10',
      mt: 'mt-12',
    },
  };

  const c = configs[rank as keyof typeof configs];

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 p-6 lg:p-8 rounded-2xl cursor-pointer group relative',
        'border border-border/50 transition-all duration-300',
        `bg-gradient-to-b ${c.gradient}`,
        c.glow,
        c.zIndex,
        c.mt,
        'hover:-translate-y-2 hover:scale-[1.03]',
        'animate-podium-rise'
      )}
      style={{ animationDelay: c.delay }}
      onClick={onSelect}
    >
      {/* Rank badge */}
      <div className={cn(
        'absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full font-display font-bold text-xs tracking-wider',
        c.labelBg
      )}>
        {rank === 1 && <Crown className="w-3 h-3 inline mr-1 -mt-0.5" />}
        {c.label}
      </div>

      {/* Shimmer effect for 1st place */}
      {rank === 1 && (
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 animate-shine-sweep opacity-20" 
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsl(45 95% 70% / 0.4) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
          />
        </div>
      )}

      {/* Avatar */}
      <Avatar className={cn(
        c.size,
        'ring-4 ring-offset-4 ring-offset-background transition-all',
        c.ring,
        'group-hover:ring-offset-2'
      )}>
        <AvatarImage src={entry.avatar_url ?? undefined} className="object-cover" />
        <AvatarFallback className="bg-primary/20 text-primary font-bold text-2xl">
          {entry.username?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Name */}
      <p className={cn(
        'font-display font-bold truncate max-w-[160px] group-hover:text-primary transition-colors',
        rank === 1 ? 'text-xl' : 'text-lg'
      )}>
        {entry.username}
      </p>

      {/* Stats */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-muted-foreground" />
          <span className="font-mono font-bold text-lg">{wins}</span>
          <span className="text-xs text-muted-foreground">wins</span>
        </div>
        <CoinDisplay amount={earnings} size="lg" />
      </div>
    </div>
  );
}

export function PodiumSection({ entries, onSelectUser }: PodiumSectionProps) {
  if (entries.length < 3) return null;

  // Order: 2nd, 1st, 3rd
  const [first, second, third] = entries;

  return (
    <div className="flex items-end justify-center gap-6 lg:gap-10 py-8 lg:py-12">
      <PodiumCard entry={second} rank={2} onSelect={() => second.user_id && onSelectUser(second.user_id)} />
      <PodiumCard entry={first} rank={1} onSelect={() => first.user_id && onSelectUser(first.user_id)} />
      <PodiumCard entry={third} rank={3} onSelect={() => third.user_id && onSelectUser(third.user_id)} />
    </div>
  );
}
