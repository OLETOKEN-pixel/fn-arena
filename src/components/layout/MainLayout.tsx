import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  showChat?: boolean;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

      {/* Main content area - Centered */}
      <div className="lg:pl-64">
        <div className="flex flex-col min-h-screen">
          <Header 
            onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMobileMenuOpen={isMobileMenuOpen}
          />
          
          <main className="flex-1 px-4 lg:px-8 xl:px-12 py-4 lg:py-6">
            <div className="max-w-screen-2xl mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
