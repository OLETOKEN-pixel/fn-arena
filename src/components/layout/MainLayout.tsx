import { useState, useEffect, useRef } from 'react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { unlockAudio, audioUnlocked } = useSoundNotifications();
  const hasUnlockedRef = useRef(false);
  const isMobile = useIsMobile();

  // ========== GLOBAL AUDIO UNLOCK ON FIRST INTERACTION ==========
  // This ensures audio works even in background tabs after user interacts once
  useEffect(() => {
    if (audioUnlocked || hasUnlockedRef.current) return;

    const handleFirstInteraction = () => {
      if (hasUnlockedRef.current) return;
      hasUnlockedRef.current = true;
      unlockAudio();
      // Clean up listeners after first interaction
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
      {/* Sidebar - Hidden on mobile, shown on desktop */}
      <div className={cn(
        'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden',
        isMobileMenuOpen ? 'block' : 'hidden'
      )} onClick={() => setIsMobileMenuOpen(false)} />
      
      <div className={cn(
        'fixed left-0 top-0 z-50 h-full transform transition-transform duration-300 lg:translate-x-0',
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <Sidebar />
      </div>

      {/* Main content area - Centered */}
      <div className="lg:pl-64">
        <div className="flex flex-col min-h-screen">
          <Header 
            onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMobileMenuOpen={isMobileMenuOpen}
          />
          
          <main className={cn(
            "flex-1 px-4 lg:px-8 xl:px-12 py-4 lg:py-6 animate-page-enter",
            isMobile && "pb-24" // Extra padding for bottom nav on mobile
          )}>
            <div className="max-w-screen-2xl mx-auto w-full">
              {children}
            </div>
          </main>
          
          {/* Global Footer - Only shows on Home page */}
          <Footer />
        </div>
      </div>

      {/* Bottom Navigation for Mobile */}
      {isMobile && <BottomNav />}
    </div>
  );
}