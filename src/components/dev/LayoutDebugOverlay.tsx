import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Layout Debug Overlay
 * Activated via ?layoutDebug=1 OR ?viewportDebug=1
 * Shows viewport info, container width, and highlights main containers
 */
export function LayoutDebugOverlay() {
  const [searchParams] = useSearchParams();
  const isEnabled = searchParams.get('layoutDebug') === '1' || searchParams.get('viewportDebug') === '1';
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(0);

  useEffect(() => {
    if (!isEnabled) return;

    const updateInfo = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      
      // Find main content container
      const container = document.querySelector('[data-layout-container]');
      if (container) {
        setContainerWidth(container.getBoundingClientRect().width);
      }
      
      // Find sidebar
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        setSidebarWidth(sidebar.getBoundingClientRect().width);
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
    viewport.width >= 1920 ? '🎯 FULL HD (1920+)' :
    viewport.width >= 1680 ? 'WIDE (1680+)' :
    viewport.width >= 1536 ? '2XL (1536+)' :
    viewport.width >= 1440 ? 'XL Wide (1440+)' :
    viewport.width >= 1280 ? 'XL (1280+)' :
    viewport.width >= 1024 ? 'LG Desktop (1024+)' :
    viewport.width >= 768 ? 'MD Tablet (768+)' :
    'SM Mobile';

  const isOptimal = viewport.width >= 1920;
  const contentArea = viewport.width - sidebarWidth;
  const usagePercent = containerWidth > 0 ? Math.round((containerWidth / contentArea) * 100) : 0;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-mono text-xs bg-black/95 border-2 border-primary/60 rounded-xl p-4 backdrop-blur-md shadow-2xl min-w-[260px]">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
        <div className={`w-3 h-3 rounded-full ${isOptimal ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
        <span className="font-bold text-primary text-sm">1920×1080 Debug</span>
      </div>
      
      <div className="space-y-2 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <span>Viewport:</span>
          <span className={`font-bold ${isOptimal ? 'text-green-400' : 'text-yellow-400'}`}>
            {viewport.width} × {viewport.height}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Sidebar:</span>
          <span className="text-foreground font-medium">{Math.round(sidebarWidth)}px</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Content Area:</span>
          <span className="text-foreground font-medium">{Math.round(contentArea)}px</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Container:</span>
          <span className="text-accent font-bold">{Math.round(containerWidth)}px</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Usage:</span>
          <span className={`font-bold ${usagePercent >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
            {usagePercent}%
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Breakpoint:</span>
          <span className="text-primary font-bold">{breakpoint}</span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-border/50">
        <div className="text-[10px] text-muted-foreground mb-2">Expected values:</div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <span className="text-muted-foreground">Sidebar:</span>
          <span className="text-foreground">300px</span>
          <span className="text-muted-foreground">Max Container:</span>
          <span className="text-foreground">1680px</span>
          <span className="text-muted-foreground">Header:</span>
          <span className="text-foreground">64px</span>
        </div>
      </div>
    </div>
  );
}
