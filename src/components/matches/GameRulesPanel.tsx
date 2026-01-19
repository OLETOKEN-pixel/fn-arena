import { useState } from 'react';
import { BookOpen, AlertCircle, ChevronDown, Clock, Wifi, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const generalRules = [
  { id: 1, icon: Clock, text: "Max 10 min to join lobby or forfeit" },
  { id: 2, icon: Wifi, text: "AFK/disconnect: 6 min pause max" },
  { id: 3, icon: User, text: "Wrong platform/name: 5 min to fix" },
];

export function GameRulesPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="border-border/50 bg-card">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between px-3 py-2 hover:bg-secondary/20 transition-colors">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Game Rules</span>
            </div>
            <ChevronDown className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )} />
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 px-3 pb-3 border-t border-border/30">
            <ul className="space-y-2 mt-2">
              {generalRules.map((rule) => {
                const Icon = rule.icon;
                return (
                  <li key={rule.id} className="flex gap-2 items-start">
                    <Icon className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">{rule.text}</p>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 pt-2 border-t border-border/30">
              <div className="flex items-start gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-200">
                  Violations may result in forfeit
                </p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
