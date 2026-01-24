import { useMemo, useState } from 'react';
import { ArrowDownLeft, Lock, Coins, ChevronDown, ChevronRight, Trophy, XCircle, RefreshCw, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/custom-badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/types';

interface TransactionHistoryProps {
  transactions: Transaction[];
  loading: boolean;
}

type MatchStatus = 'win' | 'loss' | 'refunded' | 'pending' | 'completed';

interface GroupedTransaction {
  matchId: string | null;
  matchLabel: string;
  transactions: Transaction[];
  netAmount: number;
  status: MatchStatus;
  timestamp: Date;
}

const statusConfig: Record<MatchStatus, { label: string; variant: 'default' | 'destructive' | 'outline' | 'warning' | 'success' }> = {
  win: { label: 'Vittoria', variant: 'success' },
  loss: { label: 'Sconfitta', variant: 'destructive' },
  refunded: { label: 'Rimborsato', variant: 'outline' },
  pending: { label: 'In corso', variant: 'warning' },
  completed: { label: 'Completato', variant: 'default' },
};

// Only show these transaction types in the expanded detail view
const DETAIL_VISIBLE_TYPES = ['payout', 'fee', 'refund', 'deposit'] as const;

export function TransactionHistory({ transactions, loading }: TransactionHistoryProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupedTransactions = useMemo(() => {
    const groups: Map<string, GroupedTransaction> = new Map();
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
          timestamp: new Date(tx.created_at),
        });
      }

      const group = groups.get(key)!;
      group.transactions.push(tx);

      // Update timestamp to most recent
      const txDate = new Date(tx.created_at);
      if (txDate > group.timestamp) {
        group.timestamp = txDate;
      }
    });

    // Calculate net amount and status for each match group
    groups.forEach((group) => {
      let hasPayout = false;
      let hasFee = false;
      let hasRefund = false;
      let totalLocked = 0;
      let totalPayout = 0;
      let totalFee = 0;
      let totalRefund = 0;

      group.transactions.forEach(tx => {
        switch (tx.type) {
          case 'lock':
            totalLocked += tx.amount;
            break;
          case 'payout':
            hasPayout = true;
            totalPayout += tx.amount;
            break;
          case 'fee':
            hasFee = true;
            totalFee += tx.amount;
            break;
          case 'refund':
            hasRefund = true;
            totalRefund += tx.amount;
            break;
        }
      });

      // Calculate net: payout + refund - lock - fee
      // Note: We show the user-facing result, not internal movements
      if (hasPayout) {
        // Winner: they get payout (prize), their locked stake is returned implicitly
        // Net = payout amount (this is the prize after fee deduction)
        group.netAmount = totalPayout;
        group.status = 'win';
      } else if (hasRefund) {
        // Refunded: they got their stake back
        group.netAmount = 0; // Net zero, they got back what they put in
        group.status = 'refunded';
      } else if (hasFee) {
        // Loser: they lost their stake (shows as fee transaction)
        group.netAmount = -totalFee;
        group.status = 'loss';
      } else if (totalLocked > 0) {
        // Match still in progress, funds locked
        group.netAmount = -totalLocked;
        group.status = 'pending';
      }
    });

    // Add non-match transactions as individual entries (deposits, tips, etc.)
    noMatchTxs.forEach(tx => {
      const txType = tx.type as string;
      const isCredit = ['deposit', 'payout', 'refund'].includes(txType);
      const label = txType === 'deposit' ? 'Acquisto Coins' 
        : tx.description || txType;

      groups.set(tx.id, {
        matchId: null,
        matchLabel: label,
        transactions: [tx],
        netAmount: isCredit ? tx.amount : -tx.amount,
        status: 'completed',
        timestamp: new Date(tx.created_at),
      });
    });

    // Sort by timestamp descending
    return Array.from(groups.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
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

  const getGroupIcon = (group: GroupedTransaction) => {
    if (group.status === 'win') return <Trophy className="w-5 h-5 text-success" />;
    if (group.status === 'loss') return <XCircle className="w-5 h-5 text-destructive" />;
    if (group.status === 'refunded') return <RefreshCw className="w-5 h-5 text-primary" />;
    if (group.status === 'pending') return <Clock className="w-5 h-5 text-warning" />;
    if (!group.matchId) return <Coins className="w-5 h-5 text-warning" />;
    return <Lock className="w-5 h-5 text-muted-foreground" />;
  };

  const formatAmount = (amount: number, status: MatchStatus) => {
    if (status === 'refunded') return '±0.00';
    const sign = amount > 0 ? '+' : '';
    return `${sign}${amount.toFixed(2)}`;
  };

  const getAmountClass = (amount: number, status: MatchStatus) => {
    if (status === 'refunded') return 'text-muted-foreground';
    if (amount > 0) return 'text-success';
    if (amount < 0) return 'text-foreground';
    return 'text-muted-foreground';
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
              // Only show expand for matches with multiple meaningful transactions
              const detailTransactions = group.transactions.filter(tx => 
                DETAIL_VISIBLE_TYPES.includes(tx.type as typeof DETAIL_VISIBLE_TYPES[number])
              );
              const hasDetails = group.matchId && detailTransactions.length > 0;

              return (
                <Collapsible
                  key={key}
                  open={isExpanded}
                  onOpenChange={() => hasDetails && toggleGroup(key)}
                >
                  <div className={cn(
                    "rounded-lg bg-secondary overflow-hidden",
                    hasDetails && "cursor-pointer hover:bg-secondary/80 transition-colors"
                  )}>
                    <CollapsibleTrigger asChild disabled={!hasDetails}>
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                            {getGroupIcon(group)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{group.matchLabel}</p>
                              {group.matchId && (
                                <Badge variant={statusConfig[group.status].variant}>
                                  {statusConfig[group.status].label}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {group.timestamp.toLocaleDateString('it-IT', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className={cn('font-semibold', getAmountClass(group.netAmount, group.status))}>
                              {formatAmount(group.netAmount, group.status)} Coins
                            </p>
                          </div>
                          {hasDetails && (
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
                      <div className="border-t border-border/50 px-3 py-2 space-y-1">
                        {detailTransactions.map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between py-1 text-sm"
                          >
                            <span className="text-muted-foreground">
                              {tx.type === 'payout' && 'Premio'}
                              {tx.type === 'fee' && 'Quota Match'}
                              {tx.type === 'refund' && 'Rimborso'}
                              {tx.type === 'deposit' && 'Deposito'}
                            </span>
                            <span className={cn(
                              ['payout', 'refund', 'deposit'].includes(tx.type)
                                ? 'text-success'
                                : 'text-foreground'
                            )}>
                              {['payout', 'refund', 'deposit'].includes(tx.type) ? '+' : '-'}
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
