import { MainLayout } from '@/components/layout/MainLayout';
import { HeroCompact } from '@/components/home/HeroCompact';
import { StatsBar } from '@/components/home/StatsBar';
import { LiveMatchesCompact } from '@/components/home/LiveMatchesCompact';
import { LeaderboardCompact } from '@/components/home/LeaderboardCompact';
import { ProgressCard } from '@/components/home/ProgressCard';
import { WalletSnapshot } from '@/components/home/WalletSnapshot';
import { FeatureCardsMini } from '@/components/home/FeatureCardsMini';
import { VideoBanner } from '@/components/home/VideoBanner';
import { useIsDesktop } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export default function Index() {
  const isDesktop = useIsDesktop();

  return (
    <MainLayout>
      {/* Desktop: Balanced premium layout with max-width */}
      {/* Mobile: Keep original layout unchanged */}
      <div className={cn(
        "flex flex-col gap-4",
        isDesktop && "max-w-[1400px] mx-auto"
      )}>
        {/* HERO */}
        <HeroCompact />
        
        {/* STATS BAR - Mobile only */}
        {!isDesktop && <StatsBar />}
        
        {/* MAIN GRID */}
        {isDesktop ? (
          // Desktop: 2-column layout (2/3 + 1/3)
          <div className="grid grid-cols-[2fr_1fr] gap-6">
            {/* Left: Live Matches + Progress */}
            <div className="flex flex-col gap-4">
              <LiveMatchesCompact />
              <ProgressCard />
            </div>
            
            {/* Right: Video Banner */}
            <VideoBanner />
          </div>
        ) : (
          // Mobile: Original single-column layout
          <div className="grid grid-cols-1 gap-4">
            <LiveMatchesCompact />
            <div className="flex flex-col gap-3">
              <LeaderboardCompact />
              <WalletSnapshot />
            </div>
            <ProgressCard />
          </div>
        )}

        {/* FEATURE CARDS - Mobile only */}
        {!isDesktop && <FeatureCardsMini />}
      </div>
    </MainLayout>
  );
}
