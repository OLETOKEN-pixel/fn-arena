import { Volume2, VolumeX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useSoundNotifications } from '@/hooks/useSoundNotifications';
import { cn } from '@/lib/utils';

interface SoundSettingsProps {
  compact?: boolean;
  className?: string;
}

export function SoundSettings({ compact = false, className }: SoundSettingsProps) {
  const { settings, setEnabled, setVolume, testSound, needsUnlock, unlockAudio } = useSoundNotifications();

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (needsUnlock) {
              unlockAudio();
            }
            setEnabled(!settings.enabled);
          }}
          className={cn(
            'h-8 w-8',
            settings.enabled ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {settings.enabled ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </Button>
        {settings.enabled && (
          <Slider
            value={[settings.volume]}
            onValueChange={([v]) => setVolume(v)}
            max={100}
            step={5}
            className="w-20"
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 p-4 rounded-lg bg-secondary/30', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-primary" />
          <Label htmlFor="sound-enabled" className="font-medium">
            Match Sounds
          </Label>
        </div>
        <Switch
          id="sound-enabled"
          checked={settings.enabled}
          onCheckedChange={(checked) => {
            if (checked && needsUnlock) {
              unlockAudio();
            }
            setEnabled(checked);
          }}
        />
      </div>

      {settings.enabled && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Volume</span>
              <span className="font-medium">{settings.volume}%</span>
            </div>
            <Slider
              value={[settings.volume]}
              onValueChange={([v]) => setVolume(v)}
              max={100}
              step={5}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={testSound}
            className="w-full"
          >
            <Play className="w-3 h-3 mr-2" />
            Test Sound
          </Button>

          <p className="text-xs text-muted-foreground">
            Sounds play when: match is accepted, players ready up, or results are declared.
          </p>
        </>
      )}

      {needsUnlock && settings.enabled && (
        <Button
          onClick={unlockAudio}
          size="sm"
          className="w-full"
        >
          Click to Enable Sounds
        </Button>
      )}
    </div>
  );
}
