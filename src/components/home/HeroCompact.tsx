import { Link } from 'react-router-dom';
import { Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import logoOleboy from '@/assets/logo-oleboy.png';

export function HeroCompact() {
  const { user } = useAuth();

  return (
    <section className="relative py-4 lg:py-6">
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 rounded-2xl" />
      
      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-4">
          <img 
            src={logoOleboy} 
            alt="OLEBOY TOKEN" 
            className="w-14 h-14 lg:w-18 lg:h-18 object-contain animate-pulse-slow"
          />
          <div>
            <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight">
              <span className="text-foreground">OLEBOY</span>{' '}
              <span className="text-accent glow-text-gold">TOKEN</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Competitive FN Platform
            </p>
          </div>
        </div>
        
        {/* Right: CTAs */}
        <div className="flex gap-3">
          {user ? (
            <>
              <Button size="lg" asChild className="glow-blue">
                <Link to="/matches/create">
                  <Swords className="w-5 h-5 mr-2" />
                  Create Match
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/matches">Browse</Link>
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" asChild className="glow-blue">
                <Link to="/auth?mode=signup">Get Started</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/matches">Browse</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
