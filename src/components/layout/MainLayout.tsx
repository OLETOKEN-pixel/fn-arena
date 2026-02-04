import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { cn } from '@/lib/utils';
import { useSoundNotifications } from '@/hooks/useSoundNotifications';
import { useIsMobile } from '@/hooks/use-mobile';

interface MainLayoutProps {
  children: React.ReactNode;
  showChat?: boolean;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { unlockAudio, audioUnlocked } = useSoundNotifications();
  const hasUnlockedRef = useRef(false);
  const isMobile = useIsMobile();

  // ========== GLOBAL AUDIO UNLOCK ON FIRST INTERACTION ==========
  useEffect(() => {
    if (audioUnlocked || hasUnlockedRef.current) return;

    const handleFirstInteraction = () => {
      if (hasUnlockedRef.current) return;
      hasUnlockedRef.current = true;
      unlockAudio();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [unlockAudio, audioUnlocked]);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - Desktop ONLY (hidden on mobile completely) */}
      <div className="hidden lg:block fixed left-0 top-0 h-full z-50">
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="lg:pl-64">
        <div className="flex flex-col min-h-screen">
          <Header />
          
          <main className={cn(
            "flex-1 py-4 lg:py-6 animate-page-enter",
            // Mobile: standard padding
            "px-4",
            // Desktop: no horizontal padding (handled by inner container)
            "lg:px-8",
            isMobile && "pb-24" // Extra padding for bottom nav on mobile
          )}>
            <div className={cn(
              // Mobile: full width
              "w-full",
              // Desktop: centered with controlled max-width
              "lg:max-w-[1400px] lg:mx-auto"
            )}>
              {children}
            </div>
          </main>
          
          {/* Footer - Only shows on Home page */}
          <Footer />
        </div>
      </div>

      {/* Bottom Navigation - Mobile ONLY */}
      {isMobile && <BottomNav />}
    </div>
  );
}
