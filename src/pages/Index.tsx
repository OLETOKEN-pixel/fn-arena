import { MainLayout } from '@/components/layout/MainLayout';
import { HeroSection } from '@/components/home/HeroSection';
import { FeatureCards } from '@/components/home/FeatureCards';
import { RecentMatches } from '@/components/home/RecentMatches';
import { Leaderboard } from '@/components/home/Leaderboard';

export default function Index() {
  return (
    <MainLayout>
      <HeroSection />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentMatches />
          <FeatureCards />
        </div>
        <div className="lg:col-span-1">
          <Leaderboard />
        </div>
      </div>
    </MainLayout>
  );
}