import { useState, useEffect, useRef } from 'react';

const SPLINE_SCRIPT_SRC = 'https://unpkg.com/@splinetool/viewer/build/spline-viewer.js';
const SPLINE_SCENE_URL = 'https://prod.spline.design/htiQwu8VrQ1i2Dz4/scene.splinecode';

export function SplineBackground() {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [isTabVisible, setIsTabVisible] = useState(true);
  const scriptLoadedRef = useRef(false);

  // Load script once
  useEffect(() => {
    if (scriptLoadedRef.current) return;

    const existing = document.querySelector(`script[src="${SPLINE_SCRIPT_SRC}"]`);
    if (existing) {
      scriptLoadedRef.current = true;
      setStatus('loaded');
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = SPLINE_SCRIPT_SRC;

    script.onload = () => {
      scriptLoadedRef.current = true;
      setStatus('loaded');
    };
    script.onerror = () => {
      setStatus('error');
    };

    document.body.appendChild(script);
  }, []);

  // Page Visibility API
  useEffect(() => {
    const handleVisibility = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const showViewer = status !== 'error' && isTabVisible;

  return (
    <div
      className="fixed inset-0 w-screen h-screen"
      style={{ zIndex: 0, pointerEvents: 'none' }}
    >
      {/* Dark gradient fallback - always rendered */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0A0B0F] via-[#0D0F14] to-[#0A0B0F]" />

      {/* Subtle red radial for visual cohesion with scene */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_center,rgba(255,45,45,0.06)_0%,transparent_70%)]" />
      </div>

      {/* Spline viewer */}
      {showViewer && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: status === 'loaded' ? 1 : 0 }}
        >
          {/* @ts-ignore - spline-viewer is a web component */}
          <spline-viewer
            url={SPLINE_SCENE_URL}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
    </div>
  );
}
