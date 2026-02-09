import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ExternalLink, Copy, Eye, EyeOff, Pause, Play } from 'lucide-react';

const SPLINE_SCRIPT_SRC = 'https://unpkg.com/@splinetool/viewer/build/spline-viewer.js';
const SPLINE_SCENE_URL = 'https://prod.spline.design/OsDg3A0bZO-AUr9b/scene.splinecode';
const SCENE_ID = 'OsDg3A0bZO-AUr9b';

const EMBED_CODE = `<script type="module" src="${SPLINE_SCRIPT_SRC}"></script>
<spline-viewer url="${SPLINE_SCENE_URL}"></spline-viewer>`;

type SplineStatus = 'loading' | 'loaded' | 'error';

export default function SplineTest() {
  const navigate = useNavigate();
  const [authChecking, setAuthChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Spline state
  const [status, setStatus] = useState<SplineStatus>('loading');
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(0.85);
  const [pointerEvents, setPointerEvents] = useState(false);
  const [pauseOnHidden, setPauseOnHidden] = useState(true);
  const [paused, setPaused] = useState(false);
  const loadStartRef = useRef<number>(0);

  // Admin guard
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/', { replace: true }); return; }
      const { data } = await supabase.rpc('is_admin');
      if (!data) { navigate('/', { replace: true }); return; }
      setIsAdmin(true);
      setAuthChecking(false);
    })();
  }, [navigate]);

  // Load spline script
  useEffect(() => {
    if (!isAdmin) return;
    const existing = document.querySelector(`script[src="${SPLINE_SCRIPT_SRC}"]`);
    if (existing) { setStatus('loaded'); return; }

    loadStartRef.current = performance.now();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = SPLINE_SCRIPT_SRC;
    script.onload = () => {
      setLoadTimeMs(Math.round(performance.now() - loadStartRef.current));
      setStatus('loaded');
    };
    script.onerror = () => {
      setStatus('error');
      toast.error('Failed to load Spline viewer');
    };
    document.body.appendChild(script);
  }, [isAdmin]);

  // Page visibility
  useEffect(() => {
    if (!pauseOnHidden) return;
    const handler = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [pauseOnHidden]);

  const copyEmbed = useCallback(() => {
    navigator.clipboard.writeText(EMBED_CODE).then(() => toast.success('Embed code copied!'));
  }, []);

  if (authChecking) return <LoadingPage />;

  return (
    <div className="min-h-screen relative">
      {/* Spline Background */}
      <div
        className="fixed inset-0 w-screen h-screen z-0"
        style={{
          pointerEvents: pointerEvents ? 'auto' : 'none',
          opacity,
        }}
      >
        {status === 'error' ? (
          <div className="w-full h-full bg-gradient-to-br from-[hsl(220,30%,8%)] via-[hsl(260,40%,12%)] to-[hsl(200,35%,10%)]" />
        ) : (
          <div style={{ display: paused ? 'none' : 'contents' }}>
            {/* @ts-ignore - spline-viewer is a web component */}
            <spline-viewer url={SPLINE_SCENE_URL} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
        {paused && (
          <div className="w-full h-full bg-gradient-to-br from-[hsl(220,30%,8%)] via-[hsl(260,40%,12%)] to-[hsl(200,35%,10%)] flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground text-lg">
              <Pause className="w-5 h-5" /> Paused
            </div>
          </div>
        )}
      </div>

      {/* Overlay UI */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md backdrop-blur-xl bg-card/70 border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Spline Background Test</CardTitle>
            <p className="text-sm text-muted-foreground font-mono">Scene: {SCENE_ID}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Opacity */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex justify-between">
                Opacity <span className="text-muted-foreground">{opacity.toFixed(2)}</span>
              </label>
              <Slider
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                min={0.2}
                max={1}
                step={0.05}
              />
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  {pointerEvents ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  Pointer Events
                </label>
                <Switch checked={pointerEvents} onCheckedChange={setPointerEvents} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  {pauseOnHidden ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  Pause when tab hidden
                </label>
                <Switch checked={pauseOnHidden} onCheckedChange={setPauseOnHidden} />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" asChild>
                <a href={SPLINE_SCENE_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> Open Spline
                </a>
              </Button>
              <Button variant="outline" className="flex-1" onClick={copyEmbed}>
                <Copy className="w-4 h-4" /> Copy embed
              </Button>
            </div>

            {/* Status Badge */}
            <div className="flex justify-end">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                status === 'loading' ? 'bg-warning/20 text-warning' :
                status === 'loaded' ? 'bg-success/20 text-success' :
                'bg-destructive/20 text-destructive'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  status === 'loading' ? 'bg-warning animate-pulse' :
                  status === 'loaded' ? 'bg-success' : 'bg-destructive'
                }`} />
                {status === 'loading' ? 'Loading...' :
                 status === 'loaded' ? `Loaded${loadTimeMs ? ` (${loadTimeMs}ms)` : ''}` :
                 'Error'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
