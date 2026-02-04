import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, VolumeX, Swords, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VideoBannerProps {
  className?: string;
}

export function VideoBanner({ className }: VideoBannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [showUnmuteHint, setShowUnmuteHint] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // On mount, try to play with audio. If blocked, show unmute hint
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Check localStorage for user preference
    const savedMuted = localStorage.getItem('oleboy-video-muted');
    const preferMuted = savedMuted !== 'false';
    
    video.muted = preferMuted;
    setIsMuted(preferMuted);
    
    // Try to play
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        // Autoplay succeeded
        if (!preferMuted) {
          setShowUnmuteHint(false);
        }
      }).catch(() => {
        // Autoplay with audio blocked, mute and show hint
        video.muted = true;
        setIsMuted(true);
        setShowUnmuteHint(true);
        video.play().catch(() => {});
      });
    }
  }, []);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    
    const newMuted = !isMuted;
    video.muted = newMuted;
    setIsMuted(newMuted);
    setShowUnmuteHint(false);
    localStorage.setItem('oleboy-video-muted', String(newMuted));
  };

  const handleVideoClick = () => {
    if (showUnmuteHint) {
      toggleMute();
    }
  };

  return (
    <div 
      className={cn(
        "relative rounded-2xl overflow-hidden group",
        // Flexible height that fills available space
        "flex flex-col",
        // Premium border effect
        "ring-1 ring-border/50",
        "hover:ring-primary/30 transition-all duration-300",
        className
      )}
    >
      {/* Video container with proper aspect ratio */}
      <div className="relative flex-1 min-h-[400px]">
        {/* Video element */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setIsLoaded(true)}
        >
          <source src="/videos/banner.mp4" type="video/mp4" />
        </video>

        {/* Loading state */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-card animate-pulse flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-background/40" />
        
        {/* Premium border glow effect */}
        <div className="absolute inset-0 rounded-2xl border border-primary/20 group-hover:border-primary/40 transition-colors pointer-events-none" />
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 40px rgba(79, 142, 255, 0.1), 0 0 40px rgba(79, 142, 255, 0.15)'
          }}
        />

        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-10">
          <h2 className="font-display text-2xl lg:text-3xl font-bold text-foreground mb-2 drop-shadow-lg">
            OleBoy Token Arena
          </h2>
          <p className="text-muted-foreground text-sm lg:text-base mb-6 drop-shadow-md">
            Compete. Win. Earn.
          </p>
          <div className="flex gap-3">
            <Button asChild className="glow-blue btn-premium group">
              <Link to="/matches/create">
                <Swords className="w-4 h-4 mr-2 transition-transform group-hover:rotate-12" />
                Create Match
              </Link>
            </Button>
            <Button variant="outline" asChild className="hover-lift backdrop-blur-sm bg-background/30 border-border/50 group">
              <Link to="/matches">
                Browse
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Unmute hint overlay */}
        {showUnmuteHint && (
          <button
            onClick={handleVideoClick}
            className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] z-20 cursor-pointer group/unmute"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 border border-white/20 group-hover/unmute:bg-black/80 transition-colors">
              <Volume2 className="w-5 h-5 text-white" />
              <span className="text-white text-sm font-medium">Click to unmute</span>
            </div>
          </button>
        )}

        {/* Mute/Unmute button */}
        <button
          onClick={toggleMute}
          className={cn(
            "absolute bottom-4 right-4 z-30 p-2.5 rounded-full transition-all duration-200",
            "bg-black/50 backdrop-blur-sm border border-white/20",
            "hover:bg-black/70 hover:border-white/40 hover:scale-105",
            "active:scale-95"
          )}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-white/80" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
