import { Check, Clock, Swords, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchStatus } from '@/types';

interface MatchProgressStepperProps {
  status: MatchStatus;
}

const steps = [
  { id: 1, label: 'Waiting', description: 'Waiting for opponent', icon: Users },
  { id: 2, label: 'Ready Up', description: 'All players ready up', icon: Clock },
  { id: 3, label: 'In Progress', description: 'Match in progress', icon: Swords },
  { id: 4, label: 'Completed', description: 'Match completed', icon: Trophy },
];

function getActiveStep(status: MatchStatus): number {
  switch (status) {
    case 'open':
      return 1;
    case 'full':      // Fallback per vecchia logica 1v1
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
    <div className="w-full">
      <div className="relative flex items-center justify-between">
        {/* Progress Line Background */}
        <div className="absolute left-0 right-0 top-6 h-1 bg-secondary rounded-full mx-12 lg:mx-16" />
        
        {/* Progress Line Active - Gradient */}
        <div 
          className="absolute left-0 top-6 h-1 bg-gradient-to-r from-accent via-accent to-accent/60 rounded-full mx-12 lg:mx-16 transition-all duration-700 ease-out"
          style={{ width: `calc(${((activeStep - 1) / (steps.length - 1)) * 100}% - 6rem)` }}
        />

        {/* Steps */}
        {steps.map((step) => {
          const isCompleted = step.id < activeStep;
          const isActive = step.id === activeStep;
          const isPending = step.id > activeStep;
          const Icon = step.icon;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center flex-1">
              {/* Step Circle - Larger */}
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 border-2",
                  isCompleted && "bg-accent border-accent text-accent-foreground shadow-lg shadow-accent/30",
                  isActive && "bg-gradient-to-br from-accent/30 to-accent/10 border-accent text-accent glow-gold scale-110",
                  isPending && "bg-secondary border-border text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className={cn(
                    "w-5 h-5 transition-transform",
                    isActive && "animate-pulse"
                  )} />
                )}
              </div>

              {/* Label & Description */}
              <div className="mt-3 text-center">
                <p
                  className={cn(
                    "text-sm font-bold transition-colors",
                    isCompleted && "text-accent",
                    isActive && "text-accent glow-text-gold",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p className={cn(
                  "text-xs mt-0.5 hidden sm:block",
                  isActive ? "text-foreground/80" : "text-muted-foreground/60"
                )}>
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
