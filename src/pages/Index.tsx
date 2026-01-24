import { MainLayout } from '@/components/layout/MainLayout';
import { HeroCompact } from '@/components/home/HeroCompact';
import { StatsBar } from '@/components/home/StatsBar';
import { LiveMatchesCompact } from '@/components/home/LiveMatchesCompact';
import { LeaderboardCompact } from '@/components/home/LeaderboardCompact';
import { ProgressCard } from '@/components/home/ProgressCard';
import { WalletSnapshot } from '@/components/home/WalletSnapshot';
import { FeatureCardsMini } from '@/components/home/FeatureCardsMini';

export default function Index() {
  return (
    <MainLayout>
      <div className="flex flex-col gap-3 lg:h-[calc(100vh-120px)] lg:min-h-[550px]">
        {/* HERO COMPATTO */}
        <HeroCompact />
        
        {/* STATS BAR */}
        <StatsBar />
        
        {/* MAIN GRID */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0">
          {/* LEFT: Live Matches + Progress */}
          <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
            <LiveMatchesCompact />
            <ProgressCard />
          </div>
          
          {/* RIGHT: Leaderboard + Wallet */}
          <div className="flex flex-col gap-3 min-h-0">
            <LeaderboardCompact />
            <WalletSnapshot />
          </div>
        </div>

        {/* PLATFORM FEATURES - Mini versione */}
        <FeatureCardsMini />
      </div>
    </MainLayout>
  );
}
