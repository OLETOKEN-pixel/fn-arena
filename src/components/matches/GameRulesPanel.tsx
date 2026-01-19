import { BookOpen, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const generalRules = [
  {
    id: 1,
    text: "Players have max 10 minutes to join lobby after match starts, or forfeit.",
  },
  {
    id: 2,
    text: "AFK/disconnect: 6 min pause max, then game continues or forfeit.",
  },
  {
    id: 3,
    text: "Wrong platform/name linked: 5 min to fix once staff arrives.",
  },
];

export function GameRulesPanel() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4 text-accent" />
          <span>Game Rules</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <ul className="space-y-2">
          {generalRules.map((rule) => (
            <li key={rule.id} className="flex gap-2">
              <div className="flex-shrink-0 mt-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {rule.text}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-3 pt-2 border-t border-border">
          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-accent" />
            <p>Violations may result in forfeit. Contact support for issues.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
