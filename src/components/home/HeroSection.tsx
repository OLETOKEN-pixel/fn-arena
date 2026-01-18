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
              <Button size="lg" asChild className="w-full sm:w-auto glow-blue">
                <Link to="/auth?mode=signup">
                  Get Started
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
