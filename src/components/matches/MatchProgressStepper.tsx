import { Check, Clock, Swords, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchStatus } from '@/types';

interface MatchProgressStepperProps {
  status: MatchStatus;
}

const steps = [
  { id: 1, label: 'Waiting', description: 'Waiting for opponent', icon: Users },
  { id: 2, label: 'Ready Up', description: 'All players ready up', icon: Clock },
  { id: 3, label: 'Started', description: 'Match in progress', icon: Swords },
  { id: 4, label: 'Ended', description: 'Match completed', icon: Trophy },
];

function getActiveStep(status: MatchStatus): number {
  switch (status) {
    case 'open':
      return 1;
    case 'ready_check':
      return 2;
    case 'in_progress':
    case 'result_pending':
      return 3;
    case 'completed':
    case 'admin_resolved':
    case 'disputed':
    case 'expired':
      return 4;
    default:
      return 1;
  }
}

export function MatchProgressStepper({ status }: MatchProgressStepperProps) {
  const activeStep = getActiveStep(status);

  return (
    <div className="w-full py-4">
      <div className="relative flex items-center justify-between">
        {/* Progress Line Background */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-secondary rounded-full mx-8" />
        
        {/* Progress Line Active */}
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-accent to-accent/80 rounded-full mx-8 transition-all duration-500"
          style={{ width: `calc(${((activeStep - 1) / (steps.length - 1)) * 100}% - 4rem)` }}
        />

        {/* Steps */}
        {steps.map((step) => {
          const isCompleted = step.id < activeStep;
          const isActive = step.id === activeStep;
          const isPending = step.id > activeStep;
          const Icon = step.icon;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center">
              {/* Step Circle */}
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                  isCompleted && "bg-accent border-accent text-accent-foreground",
                  isActive && "bg-accent/20 border-accent text-accent glow-gold",
                  isPending && "bg-secondary border-border text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className={cn("w-5 h-5", isActive && "animate-pulse")} />
                )}
              </div>

              {/* Label */}
              <div className="mt-3 text-center">
                <p
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    isCompleted && "text-accent",
                    isActive && "text-accent glow-text-gold",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block max-w-[100px]">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
