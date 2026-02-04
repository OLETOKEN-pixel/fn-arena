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
      <div className="flex flex-col gap-4 lg:gap-6">
        {/* HERO */}
        <HeroCompact />
        
        {/* STATS BAR - Mobile only */}
        {!isDesktop && <StatsBar />}
        
        {/* MAIN GRID */}
        {isDesktop ? (
          // Desktop: Balanced 2:1 grid with minmax for proper sizing
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(360px,1fr)] gap-6">
            {/* Left: Live Matches + Progress */}
            <div className="flex flex-col gap-4">
              <LiveMatchesCompact />
              <ProgressCard />
            </div>
            
            {/* Right: Video Banner - stretches to match left column height */}
            <VideoBanner className="h-full" />
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
