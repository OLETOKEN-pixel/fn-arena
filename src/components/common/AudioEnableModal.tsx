import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface AudioEnableModalProps {
  open: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

const DISMISS_KEY = 'audio_modal_dismissed';

export function AudioEnableModal({ open, onEnable, onDismiss }: AudioEnableModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleEnable = () => {
    onEnable();
  };

  const handleDismiss = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(DISMISS_KEY, 'true');
      } catch {
        // Ignore localStorage errors
      }
    }
    onDismiss();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Volume2 className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Enable Match Sounds</DialogTitle>
          <DialogDescription className="text-center">
            Get instant audio notifications when important match events happen:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent">🎮</span>
            </div>
            <div className="text-sm">
              <p className="font-medium">Player Joined</p>
              <p className="text-muted-foreground text-xs">When an opponent joins your match</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
              <span className="text-success">✓</span>
            </div>
            <div className="text-sm">
              <p className="font-medium">Team Ready</p>
              <p className="text-muted-foreground text-xs">When teams are ready to start</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-primary">🏆</span>
            </div>
            <div className="text-sm">
              <p className="font-medium">Result Declared</p>
              <p className="text-muted-foreground text-xs">When match results are submitted</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Button 
            onClick={handleEnable} 
            className="w-full bg-primary hover:bg-primary/90"
            size="lg"
          >
            <Volume2 className="w-4 h-4 mr-2" />
            Enable Sounds
          </Button>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="dontShowAgain"
                checked={dontShowAgain}
                onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              />
              <Label
                htmlFor="dontShowAgain"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Don't show again
              </Label>
            </div>

            <button
              onClick={handleDismiss}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useAudioModalDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}
