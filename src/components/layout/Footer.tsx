import { Link } from 'react-router-dom';
import { Youtube } from 'lucide-react';
import logoOleboy from '@/assets/logo-oleboy.png';

// Custom SVG icons for social platforms not in Lucide
const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-sidebar border-t border-sidebar-border mt-auto">
      <div className="max-w-screen-2xl mx-auto px-4 lg:px-8 xl:px-12 py-10">
        {/* Main Grid - 3 columns desktop, stacked mobile */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          
          {/* Left Column: Brand + Description + Legal Links */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
              <img src={logoOleboy} alt="OleBoy Token" className="w-10 h-10 object-contain" />
              <span className="font-display font-bold text-lg">
                OleBoy <span className="text-accent">Token</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Competitive FN platform where players compete in 1v1, 2v2, 3v3 and 4v4 matches for real prizes. Join the community and prove your skills.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <Link 
                to="/rules" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                How To Play
              </Link>
              <Link 
                to="/terms" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Terms of Service
              </Link>
              <Link 
                to="/privacy" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
          
          {/* Center Column: Navigation */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Navigation</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Link 
                to="/matches" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Matches
              </Link>
              <Link 
                to="/leaderboard" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Leaderboard
              </Link>
              <Link 
                to="/challenges" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Challenges
              </Link>
              <Link 
                to="/buy" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Shop
              </Link>
              <Link 
                to="/teams" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Teams
              </Link>
              <Link 
                to="/profile" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Profile
              </Link>
            </div>
          </div>
          
          {/* Right Column: Connect / Social */}
          <div className="md:text-right">
            <h4 className="font-semibold mb-4 text-foreground">Connect</h4>
            <div className="flex gap-3 md:justify-end">
              <a 
                href="https://discord.gg/lovable-dev" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                aria-label="Discord"
              >
                <DiscordIcon />
              </a>
              <a 
                href="https://x.com/oleboytokens" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                aria-label="X (Twitter)"
              >
                <XIcon />
              </a>
              <a 
                href="https://www.tiktok.com/@oleboytokens" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                aria-label="TikTok"
              >
                <TikTokIcon />
              </a>
              <a 
                href="#" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                aria-label="YouTube"
              >
                <Youtube className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
        
        {/* Copyright bottom row */}
        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center md:text-right">
            © {currentYear} OleBoy Token. All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
