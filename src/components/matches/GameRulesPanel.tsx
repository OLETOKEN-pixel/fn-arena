import { BookOpen, AlertCircle, Clock, Wifi, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const generalRules = [
  { id: 1, icon: Clock, text: "Max 10 min to join lobby or forfeit" },
  { id: 2, icon: Wifi, text: "AFK/disconnect: 6 min pause max" },
  { id: 3, icon: User, text: "Wrong platform/name: 5 min to fix" },
];

export function GameRulesPanel() {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-accent" />
          <span className="text-sm font-semibold">Game Rules</span>
        </div>
        
        {/* Rules list - always visible */}
        <ul className="space-y-2.5">
          {generalRules.map((rule) => {
            const Icon = rule.icon;
            return (
              <li key={rule.id} className="flex gap-2.5 items-start">
                <Icon className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{rule.text}</p>
              </li>
            );
          })}
        </ul>

        {/* Warning */}
        <div className="mt-3 pt-3 border-t border-border/30">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              Violations may result in forfeit
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
