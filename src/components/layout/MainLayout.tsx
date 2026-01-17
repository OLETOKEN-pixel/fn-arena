import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChatPanel } from './ChatPanel';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  showChat?: boolean;
}

export function MainLayout({ children, showChat = true }: MainLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
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

      {/* Main content area */}
      <div className="lg:pl-64">
        <div className={cn(
          'flex flex-col min-h-screen',
          showChat && 'lg:pr-80 xl:pr-96'
        )}>
          <Header 
            onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMobileMenuOpen={isMobileMenuOpen}
          />
          
          <main className="flex-1 p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>

      {/* Chat Panel - Desktop */}
      {showChat && (
        <div className="hidden lg:block fixed right-0 top-0 h-screen w-80 xl:w-96">
          <ChatPanel 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
