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

export default function Index() {
  const isDesktop = useIsDesktop();

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 lg:gap-10">
        {/* Hero Section — Playmode giant typography */}
        <HeroCompact />
        
        {/* Stats Bar - Mobile only */}
        {!isDesktop && <StatsBar />}
        
        {/* Main Content Grid */}
        {isDesktop ? (
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(520px,1fr)] gap-8 items-start">
            <div className="flex flex-col gap-6">
              <LiveMatchesCompact />
              <ProgressCard />
            </div>
            <VideoBanner className="h-auto min-h-[560px] sticky top-24" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <LiveMatchesCompact />
            <div className="flex flex-col gap-3">
              <LeaderboardCompact />
              <WalletSnapshot />
            </div>
            <ProgressCard />
          </div>
        )}

        {/* Feature Cards - Mobile only */}
        {!isDesktop && <FeatureCardsMini />}
      </div>
    </MainLayout>
  );
}
