import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo-oleboy.png';

interface AppLoadingGuardProps {
  children: React.ReactNode;
}

export function AppLoadingGuard({ children }: AppLoadingGuardProps) {
  const { loading, profile } = useAuth();

  // Preload active avatar for instant display
  useEffect(() => {
    if (profile?.avatar_url) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = profile.avatar_url;
      document.head.appendChild(link);
      
      // Also preload into browser cache
      const img = new Image();
      img.src = profile.avatar_url;
    }
  }, [profile?.avatar_url]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <img 
            src={logo} 
            className="w-20 h-20 animate-pulse mx-auto mb-4 object-contain" 
            alt="Loading..."
          />
          <p className="text-muted-foreground animate-pulse">Caricamento...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
