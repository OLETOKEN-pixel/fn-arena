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
      <div className="flex flex-col gap-4 lg:gap-8">
        {/* Hero Section - Full width within container */}
        <HeroCompact />
        
        {/* Stats Bar - Mobile only (removed on desktop per requirements) */}
        {!isDesktop && <StatsBar />}
        
        {/* Main Content Grid - 1920×1080 optimized */}
        {isDesktop ? (
          /* Desktop Layout: 2-column with WIDER right column (520px min) */
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(520px,1fr)] gap-8 items-start">
            {/* Left Column: Live Matches + Progress - fills space */}
            <div className="flex flex-col gap-6">
              <LiveMatchesCompact />
              <ProgressCard />
            </div>
            
            {/* Right Column: Video Banner - tall, premium, fills vertical space */}
            <VideoBanner className="h-auto min-h-[560px] sticky top-24" />
          </div>
        ) : (
          /* Mobile Layout: Single column, unchanged */
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
