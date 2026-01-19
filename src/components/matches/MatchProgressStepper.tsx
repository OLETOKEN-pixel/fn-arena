import { Check, Clock, Swords, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchStatus } from '@/types';

interface MatchProgressStepperProps {
  status: MatchStatus;
}

const steps = [
  { id: 1, label: 'Waiting', icon: Users },
  { id: 2, label: 'Ready', icon: Clock },
  { id: 3, label: 'Playing', icon: Swords },
  { id: 4, label: 'Done', icon: Trophy },
];

function getActiveStep(status: MatchStatus): number {
  switch (status) {
    case 'open':
      return 1;
    case 'full':
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
        <div className="absolute left-0 right-0 top-4 h-0.5 bg-secondary rounded-full mx-8" />
        
        {/* Progress Line Active */}
        <div 
          className="absolute left-0 top-4 h-0.5 bg-accent rounded-full mx-8 transition-all duration-500"
          style={{ width: `calc(${((activeStep - 1) / (steps.length - 1)) * 100}% - 4rem)` }}
        />

        {/* Steps */}
        {steps.map((step) => {
          const isCompleted = step.id < activeStep;
          const isActive = step.id === activeStep;
          const isPending = step.id > activeStep;
          const Icon = step.icon;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center flex-1">
              {/* Step Circle - Compact */}
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all border",
                  isCompleted && "bg-accent border-accent text-accent-foreground",
                  isActive && "bg-accent/20 border-accent text-accent scale-110",
                  isPending && "bg-secondary border-border text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Icon className={cn(
                    "w-3.5 h-3.5",
                    isActive && "animate-pulse"
                  )} />
                )}
              </div>

              {/* Label */}
              <p
                className={cn(
                  "text-[10px] font-medium mt-1.5",
                  isCompleted && "text-accent",
                  isActive && "text-accent",
                  isPending && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
