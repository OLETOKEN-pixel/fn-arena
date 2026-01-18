import { BookOpen, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const generalRules = [
  {
    id: 1,
    text: "Players have a maximum of 10 minutes from the match starting to get into the lobby. If you aren't ready within this time, you will be forfeited.",
  },
  {
    id: 2,
    text: "If a player goes AFK or disconnects midgame, the game can be paused for up to 6 minutes. After this period, the game must continue or the absent player will be forfeited.",
  },
  {
    id: 3,
    text: "If a player has linked a game account with incorrect platform or name, they have 5 minutes to rectify this from the time a Staff member arrives.",
  },
];

export function GameRulesPanel() {
  return (
    <Card className="bg-card border-border h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="w-5 h-5 text-accent" />
          <span>Game Rules</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full bg-secondary/50 mb-4">
            <TabsTrigger value="general" className="flex-1 data-[state=active]:bg-accent/20 data-[state=active]:text-accent">
              General
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="mt-0">
            <ul className="space-y-4">
              {generalRules.map((rule) => (
                <li key={rule.id} className="flex gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {rule.text}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent" />
                <p>
                  Violating these rules may result in forfeiture. Contact support if you experience issues.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
