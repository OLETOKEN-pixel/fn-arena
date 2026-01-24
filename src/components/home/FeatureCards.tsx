import { Swords, Wallet, Users, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: Swords,
    title: 'Competitive Matches',
    description: 'Create or join FN matches with custom rules, regions, and entry fees.',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    icon: Wallet,
    title: 'Secure Wallet',
    description: 'Deposit Coins via Stripe. All match fees are held in secure escrow.',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
  {
    icon: Users,
    title: 'Team System',
    description: 'Create your team, invite players, and compete in team-based matches.',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  {
    icon: Trophy,
    title: 'Leaderboard',
    description: 'Track your wins, earnings, and compete for the top spot each month.',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
];

export function FeatureCards() {
  return (
    <section className="py-12">
      <h2 className="font-display text-2xl font-bold mb-6 text-center">
        Platform Features
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card 
              key={feature.title} 
              className="card-hover bg-card border-border"
            >
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-lg ${feature.bgColor} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
