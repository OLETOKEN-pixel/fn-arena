import { Link } from 'react-router-dom';
import { Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { CoinIcon } from '@/components/common/CoinIcon';
import logoOleboy from '@/assets/logo-oleboy.png';

export function HeroSection() {
  const { user } = useAuth();

  return (
    <section className="relative py-8 lg:py-14 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-radial opacity-30" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />

      <div className="relative max-w-4xl mx-auto text-center px-4">
        {/* Logo - larger and more impactful */}
        <div className="mb-4 flex justify-center">
          <img 
            src={logoOleboy} 
            alt="OLEBOY TOKEN" 
            className="w-28 h-28 lg:w-36 lg:h-36 object-contain animate-float"
          />
        </div>

        {/* Title */}
        <h1 className="font-display text-4xl lg:text-6xl font-bold mb-3">
          <span className="text-foreground">OLEBOY</span>{' '}
          <span className="text-accent glow-text-gold">TOKEN</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg lg:text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
          The ultimate FN competitive gaming platform. 
          Create matches, compete for Coins, and climb the leaderboard.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          {user ? (
            <>
              <Button size="lg" asChild className="w-full sm:w-auto glow-blue">
                <Link to="/matches/create">
                  <Swords className="w-5 h-5 mr-2" />
                  Create Match
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link to="/matches">
                  Browse Matches
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" asChild className="w-full sm:w-auto bg-[#5865F2] hover:bg-[#4752C4] text-white">
                <Link to="/auth">
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Inizia con Discord
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link to="/matches">
                  Browse Matches
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
          <div className="p-4 rounded-lg bg-card border border-border">
            <Trophy className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="text-2xl font-bold">1,234</p>
            <p className="text-xs text-muted-foreground">Matches Played</p>
          </div>
          <div className="p-4 rounded-lg bg-card border border-border">
            <CoinIcon size="md" className="mx-auto mb-2" />
            <p className="text-2xl font-bold">€50K+</p>
            <p className="text-xs text-muted-foreground">Prizes Won</p>
          </div>
          <div className="p-4 rounded-lg bg-card border border-border">
            <Swords className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="text-2xl font-bold">500+</p>
            <p className="text-xs text-muted-foreground">Active Players</p>
          </div>
        </div>
      </div>
    </section>
  );
}
