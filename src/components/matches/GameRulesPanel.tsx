import { useState } from 'react';
import { BookOpen, AlertCircle, ChevronDown, Clock, Wifi, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const generalRules = [
  {
    id: 1,
    icon: Clock,
    text: "Players have max 10 minutes to join lobby after match starts, or forfeit.",
  },
  {
    id: 2,
    icon: Wifi,
    text: "AFK/disconnect: 6 min pause max, then game continues or forfeit.",
  },
  {
    id: 3,
    icon: User,
    text: "Wrong platform/name linked: 5 min to fix once staff arrives.",
  },
];

export function GameRulesPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="border-border/50 bg-gradient-to-br from-card via-card to-secondary/10 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center border border-accent/30">
                <BookOpen className="w-4 h-4 text-accent" />
              </div>
              <div className="text-left">
                <span className="font-semibold text-base">Game Rules</span>
                <p className="text-xs text-muted-foreground">Click to expand</p>
              </div>
            </div>
            <ChevronDown className={cn(
              "w-5 h-5 text-muted-foreground transition-transform duration-300",
              isOpen && "rotate-180"
            )} />
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 px-5 pb-5 border-t border-border/30">
            <ul className="space-y-4 mt-4">
              {generalRules.map((rule) => {
                const Icon = rule.icon;
                return (
                  <li key={rule.id} className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center border border-border/30">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pt-1">
                      {rule.text}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 pt-4 border-t border-border/30">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                <p className="text-xs">
                  Violations may result in forfeit. Contact support for issues.
                </p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
