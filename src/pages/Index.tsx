import { MainLayout } from '@/components/layout/MainLayout';
import { HeroCompact } from '@/components/home/HeroCompact';
import { StatsBar } from '@/components/home/StatsBar';
import { LiveMatchesCompact } from '@/components/home/LiveMatchesCompact';
import { LeaderboardCompact } from '@/components/home/LeaderboardCompact';
import { ProgressCard } from '@/components/home/ProgressCard';
import { WalletSnapshot } from '@/components/home/WalletSnapshot';
import { FeatureCardsMini } from '@/components/home/FeatureCardsMini';
import { FilterBar } from '@/components/home/FilterBar';
import { useIsDesktop } from '@/hooks/use-mobile';

export default function Index() {
  const isDesktop = useIsDesktop();

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 lg:gap-8">
        {/* Filter bar — desktop */}
        {isDesktop && <FilterBar />}

        {/* Hero Banner — Figma "Hot & New" */}
        <HeroCompact />
        
        {/* Stats Bar - Mobile only */}
        {!isDesktop && <StatsBar />}
        
        {/* Live Matches — full width */}
        <LiveMatchesCompact />

        {/* Progress + extras */}
        {isDesktop ? (
          <div className="grid grid-cols-2 gap-6">
            <ProgressCard />
            <LeaderboardCompact />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <LeaderboardCompact />
            <WalletSnapshot />
            <ProgressCard />
          </div>
        )}

        {/* Feature Cards - Mobile only */}
        {!isDesktop && <FeatureCardsMini />}
      </div>
    </MainLayout>
  );
}
