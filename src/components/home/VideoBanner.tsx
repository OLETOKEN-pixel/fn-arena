import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, VolumeX, Swords, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface VideoBannerProps {
  className?: string;
}

export function VideoBanner({ className }: VideoBannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [showUnmuteHint, setShowUnmuteHint] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Try to play with audio first
    video.muted = false;
    const playPromise = video.play();
    
    if (playPromise !== undefined) {
      playPromise.then(() => {
        // Autoplay with audio worked
        setIsMuted(false);
        setShowUnmuteHint(false);
      }).catch(() => {
        // Autoplay with audio blocked, fallback to muted
        video.muted = true;
        setIsMuted(true);
        video.play().catch(console.error);
      });
    }
  }, []);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
    setIsMuted(video.muted);
    setShowUnmuteHint(false);
    
    // Save preference
    localStorage.setItem('videoBannerMuted', String(video.muted));
  };

  const handleVideoClick = () => {
    if (isMuted) {
      toggleMute();
    }
  };

  return (
    <div className={cn(
      "relative rounded-2xl overflow-hidden group",
      // Height: Fill parent grid cell on desktop, min-height on mobile
      "h-full min-h-[400px] lg:min-h-0",
      className
    )}>
      {/* Premium border glow */}
      <div className="absolute -inset-[1px] bg-gradient-to-br from-primary/40 via-accent/30 to-primary/40 rounded-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Video Container */}
      <div className="absolute inset-[2px] rounded-2xl overflow-hidden bg-background">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover cursor-pointer"
          loop
          playsInline
          preload="metadata"
          onClick={handleVideoClick}
        >
          <source src="/videos/banner.mp4" type="video/mp4" />
        </video>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-transparent" />

        {/* Content Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end p-6">
          {/* Text Content */}
          <div className="space-y-3 mb-4">
            <h2 className="font-display text-2xl lg:text-3xl font-bold">
              <span className="text-foreground">OleBoy</span>{' '}
              <span className="text-accent glow-text-gold">Arena</span>
            </h2>
            <p className="text-muted-foreground text-sm lg:text-base max-w-xs">
              Compete. Win. Earn.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex gap-3">
            <Button asChild className="glow-blue btn-premium group">
              <Link to={user ? "/matches/create" : "/auth?next=/matches/create"}>
                <Swords className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                Create Match
              </Link>
            </Button>
            <Button variant="outline" asChild className="hover-lift backdrop-blur-sm bg-background/30">
              <Link to="/matches">
                <Play className="w-4 h-4 mr-2" />
                Browse
              </Link>
            </Button>
          </div>
        </div>

        {/* Unmute Hint (when muted) */}
        {isMuted && showUnmuteHint && (
          <button
            onClick={toggleMute}
            className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "px-6 py-3 rounded-full",
              "bg-background/80 backdrop-blur-sm border border-border",
              "flex items-center gap-2 text-sm font-medium",
              "hover:bg-background hover:border-primary/50 transition-all",
              "animate-pulse-soft"
            )}
          >
            <Volume2 className="w-5 h-5 text-primary" />
            <span>Click to unmute</span>
          </button>
        )}

        {/* Mute/Unmute Toggle */}
        <button
          onClick={toggleMute}
          className={cn(
            "absolute top-4 right-4 p-3 rounded-full transition-all duration-300",
            "bg-background/60 backdrop-blur-sm border border-border/50",
            "hover:bg-background hover:border-primary/50 hover:scale-110",
            "group-hover:opacity-100",
            isMuted ? "opacity-100" : "opacity-60"
          )}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-muted-foreground" />
          ) : (
            <Volume2 className="w-5 h-5 text-primary" />
          )}
        </button>
      </div>
    </div>
  );
}
