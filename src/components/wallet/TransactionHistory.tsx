import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownLeft, Lock, Coins, ChevronDown, ChevronRight, Trophy, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/custom-badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/types';
import { useState } from 'react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  loading: boolean;
}

interface GroupedTransactions {
  matchId: string | null;
  matchLabel: string;
  transactions: Transaction[];
  netAmount: number;
  status: 'completed' | 'pending' | 'refunded' | 'loss' | 'win';
}

const transactionIcons: Record<string, React.ReactNode> = {
  deposit: <ArrowDownLeft className="w-4 h-4 text-success" />,
  lock: <Lock className="w-4 h-4 text-warning" />,
  unlock: <Lock className="w-4 h-4 text-muted-foreground" />,
  payout: <Trophy className="w-4 h-4 text-success" />,
  refund: <RefreshCw className="w-4 h-4 text-primary" />,
  fee: <XCircle className="w-4 h-4 text-destructive" />,
};

const transactionLabels: Record<string, string> = {
  deposit: 'Deposito',
  lock: 'Bloccato',
  unlock: 'Sbloccato',
  payout: 'Vincita',
  refund: 'Rimborso',
  fee: 'Quota persa',
};

export function TransactionHistory({ transactions, loading }: TransactionHistoryProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Group transactions by match
  const groupedTransactions = useMemo(() => {
    const groups: Map<string, GroupedTransactions> = new Map();
    const noMatchTxs: Transaction[] = [];
    
    transactions.forEach(tx => {
      if (!tx.match_id) {
        noMatchTxs.push(tx);
        return;
      }
      
      const key = tx.match_id;
      if (!groups.has(key)) {
        groups.set(key, {
          matchId: tx.match_id,
          matchLabel: `Match #${tx.match_id.slice(0, 8)}`,
          transactions: [],
          netAmount: 0,
          status: 'pending',
        });
      }
      
      const group = groups.get(key)!;
      group.transactions.push(tx);
      
      // Calculate net amount
      if (['deposit', 'payout', 'refund', 'unlock'].includes(tx.type)) {
        group.netAmount += tx.amount;
      } else {
        group.netAmount -= tx.amount;
      }
      
      // Determine status
      if (tx.type === 'payout') group.status = 'win';
      else if (tx.type === 'fee' && tx.description?.includes('perso')) group.status = 'loss';
      else if (tx.type === 'refund') group.status = 'refunded';
    });
    
    // Add non-match transactions as individual groups
    noMatchTxs.forEach(tx => {
      groups.set(tx.id, {
        matchId: null,
        matchLabel: tx.type === 'deposit' ? 'Acquisto Coins' : transactionLabels[tx.type] || tx.type,
        transactions: [tx],
        netAmount: ['deposit', 'payout', 'refund', 'unlock'].includes(tx.type) ? tx.amount : -tx.amount,
        status: 'completed',
      });
    });
    
    // Sort by most recent transaction in each group
    return Array.from(groups.values()).sort((a, b) => {
      const aDate = new Date(a.transactions[0].created_at).getTime();
      const bDate = new Date(b.transactions[0].created_at).getTime();
      return bDate - aDate;
    });
  }, [transactions]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getStatusBadge = (status: GroupedTransactions['status']) => {
    switch (status) {
      case 'win':
        return <Badge variant="default" className="bg-success text-success-foreground">Vittoria</Badge>;
      case 'loss':
        return <Badge variant="destructive">Sconfitta</Badge>;
      case 'refunded':
        return <Badge variant="outline">Rimborsato</Badge>;
      default:
        return null;
    }
  };

  const getGroupIcon = (group: GroupedTransactions) => {
    if (group.status === 'win') return <Trophy className="w-5 h-5 text-success" />;
    if (group.status === 'loss') return <XCircle className="w-5 h-5 text-destructive" />;
    if (group.status === 'refunded') return <RefreshCw className="w-5 h-5 text-primary" />;
    if (!group.matchId) return <Coins className="w-5 h-5 text-warning" />;
    return <Lock className="w-5 h-5 text-muted-foreground" />;
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Storico Transazioni</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Storico Transazioni</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nessuna transazione
          </p>
        ) : (
          <div className="space-y-2">
            {groupedTransactions.map((group) => {
              const key = group.matchId || group.transactions[0].id;
              const isExpanded = expandedGroups.has(key);
              const hasSingleTx = group.transactions.length === 1;
              
              return (
                <Collapsible 
                  key={key} 
                  open={isExpanded} 
                  onOpenChange={() => !hasSingleTx && toggleGroup(key)}
                >
                  <div className={cn(
                    "rounded-lg bg-secondary overflow-hidden",
                    !hasSingleTx && "cursor-pointer hover:bg-secondary/80 transition-colors"
                  )}>
                    <CollapsibleTrigger asChild disabled={hasSingleTx}>
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                            {getGroupIcon(group)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{group.matchLabel}</p>
                              {getStatusBadge(group.status)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(group.transactions[0].created_at).toLocaleDateString('it-IT', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {!hasSingleTx && ` • ${group.transactions.length} movimenti`}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className={cn(
                              'font-semibold',
                              group.netAmount > 0 ? 'text-success' : group.netAmount < 0 ? 'text-foreground' : 'text-muted-foreground'
                            )}>
                              {group.netAmount > 0 ? '+' : ''}{group.netAmount.toFixed(2)} Coins
                            </p>
                          </div>
                          {!hasSingleTx && (
                            isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="border-t border-border/50 px-3 py-2 space-y-2">
                        {group.transactions.map((tx) => (
                          <div 
                            key={tx.id}
                            className="flex items-center justify-between py-2 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              {transactionIcons[tx.type]}
                              <span className="text-muted-foreground">
                                {tx.description || transactionLabels[tx.type] || tx.type}
                              </span>
                            </div>
                            <span className={cn(
                              ['deposit', 'payout', 'refund', 'unlock'].includes(tx.type)
                                ? 'text-success'
                                : 'text-foreground'
                            )}>
                              {['deposit', 'payout', 'refund', 'unlock'].includes(tx.type) ? '+' : '-'}
                              {tx.amount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
