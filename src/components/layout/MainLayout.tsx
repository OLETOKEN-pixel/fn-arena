import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { LayoutDebugOverlay } from '@/components/dev/LayoutDebugOverlay';
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
      {/* Wider sidebar (300px) for 1920×1080 premium feel */}
      <div className="hidden lg:block fixed left-0 top-0 h-full z-50">
        <Sidebar />
      </div>

      {/* Main content area - offset by 300px sidebar on desktop */}
      <div className="lg:pl-[300px]">
        <div className="flex flex-col min-h-screen">
          <Header />
          
          {/* Main content with proper container for 1920×1080 */}
          <main className={cn(
            "flex-1 py-4 lg:py-8 animate-page-enter",
            // Mobile: standard padding
            "px-4",
            // Desktop: remove padding here, let inner container handle it
            "lg:px-0",
            // Extra padding for bottom nav on mobile
            isMobile && "pb-24"
          )}>
            {/* Desktop container: max-w-1680px for FULL 1920 usage */}
            {/* This fills the space properly on 1920×1080 */}
            <div 
              data-layout-container
              className={cn(
                // Mobile: full width
                "w-full",
                // Desktop: wider max-width (1680px) with generous padding
                "lg:max-w-[1680px] lg:mx-auto lg:px-10"
              )}
            >
              {children}
            </div>
          </main>
          
          {/* Footer - Only shows on Home page */}
          <Footer />
        </div>
      </div>

      {/* Bottom Navigation - Mobile ONLY */}
      {isMobile && <BottomNav />}

      {/* Layout Debug Overlay - activated via ?layoutDebug=1 */}
      <LayoutDebugOverlay />
    </div>
  );
}
