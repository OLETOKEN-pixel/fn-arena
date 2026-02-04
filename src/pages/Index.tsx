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
      <div className="flex flex-col gap-4 lg:gap-6">
        {/* Hero Section - Full width within container */}
        <HeroCompact />
        
        {/* Stats Bar - Mobile only */}
        {!isDesktop && <StatsBar />}
        
        {/* Main Content Grid */}
        {isDesktop ? (
          /* Desktop Layout: 2-column with minmax for 1920×1080 balance */
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(380px,1fr)] gap-6 items-start">
            {/* Left Column: Live Matches + Progress */}
            <div className="flex flex-col gap-4">
              <LiveMatchesCompact />
              <ProgressCard />
            </div>
            
            {/* Right Column: Video Banner */}
            {/* Height matches left column content naturally */}
            <VideoBanner className="h-auto min-h-[400px]" />
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
