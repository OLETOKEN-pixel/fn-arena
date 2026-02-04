import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Layout Debug Overlay
 * Activated via ?layoutDebug=1
 * Shows viewport info, container width, and highlights main containers
 */
export function LayoutDebugOverlay() {
  const [searchParams] = useSearchParams();
  const isEnabled = searchParams.get('layoutDebug') === '1';
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!isEnabled) return;

    const updateInfo = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      
      // Find main content container
      const container = document.querySelector('[data-layout-container]');
      if (container) {
        setContainerWidth(container.getBoundingClientRect().width);
      }
    };

    updateInfo();
    window.addEventListener('resize', updateInfo);

    // Add debug border to containers
    document.body.classList.add('layout-debug-mode');

    return () => {
      window.removeEventListener('resize', updateInfo);
      document.body.classList.remove('layout-debug-mode');
    };
  }, [isEnabled]);

  if (!isEnabled) return null;

  const breakpoint = 
    viewport.width >= 1920 ? 'FULL HD (1920+)' :
    viewport.width >= 1536 ? '2XL (1536+)' :
    viewport.width >= 1440 ? 'XL Wide (1440+)' :
    viewport.width >= 1280 ? 'XL (1280+)' :
    viewport.width >= 1024 ? 'LG Desktop (1024+)' :
    viewport.width >= 768 ? 'MD Tablet (768+)' :
    'SM Mobile';

  const isOptimal = viewport.width >= 1024 && viewport.width <= 1920;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-mono text-xs bg-black/90 border border-primary/50 rounded-lg p-3 backdrop-blur-sm shadow-xl">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${isOptimal ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
        <span className="font-semibold text-primary">Layout Debug</span>
      </div>
      
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <span>Viewport:</span>
          <span className="text-foreground font-medium">{viewport.width} × {viewport.height}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Container:</span>
          <span className="text-foreground font-medium">{Math.round(containerWidth)}px</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Breakpoint:</span>
          <span className="text-primary font-medium">{breakpoint}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Header:</span>
          <span className="text-foreground">64px</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Sidebar:</span>
          <span className="text-foreground">256px</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Max Content:</span>
          <span className="text-foreground">1400px</span>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
        Target: 1920×1080 @ 100% zoom
      </div>
    </div>
  );
}
