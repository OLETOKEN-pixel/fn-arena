import { Link } from 'react-router-dom';
import { Swords, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function HeroCompact() {
  const { user } = useAuth();

  return (
    <section className="relative py-12 lg:py-20 overflow-hidden">
      {/* Subtle top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-primary/[0.03] blur-[80px] rounded-full pointer-events-none" />
      
      <div className="relative flex flex-col items-center text-center gap-6 lg:gap-8">
        {/* Giant Playmode-style title */}
        <div>
          <h1 className="text-hero text-foreground">
            OLEBOY<br />
            <span className="text-primary">TOKEN</span>
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground mt-4 max-w-md mx-auto">
            The competitive Fortnite platform where skill meets reward
          </p>
        </div>
        
        {/* CTAs */}
        <div className="flex gap-3 mt-2">
          {user ? (
            <>
              <Button size="lg" asChild className="btn-premium group">
                <Link to="/matches/create">
                  <Swords className="w-5 h-5 mr-2 transition-transform group-hover:rotate-12" />
                  Create Match
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="hover-lift group">
                <Link to="/matches">
                  Browse
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" asChild className="bg-[#5865F2] hover:bg-[#4752C4] text-white">
                <Link to="/auth">
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Sign in with Discord
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="hover-lift group">
                <Link to="/matches">
                  Browse
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Section divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </section>
  );
}
