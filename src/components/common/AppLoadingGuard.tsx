import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo-oleboy.png';

interface AppLoadingGuardProps {
  children: React.ReactNode;
}

export function AppLoadingGuard({ children }: AppLoadingGuardProps) {
  const { loading } = useAuth();

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
