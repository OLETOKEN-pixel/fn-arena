import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Swords, DollarSign, AlertTriangle, Ban, CheckCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/custom-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, Match, Transaction } from '@/types';
import { LoadingPage } from '@/components/common/LoadingSpinner';

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Check admin status via secure server-side function
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      
      const { data, error } = await supabase.rpc('is_admin');
      if (error || !data) {
        setIsAdmin(false);
        navigate('/');
      } else {
        setIsAdmin(true);
      }
    };
    
    if (!authLoading) {
      checkAdmin();
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user || isAdmin !== true) return;

    const fetchData = async () => {
      // Fetch users - now protected by RLS, only admins can see all
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (usersData) setUsers(usersData as Profile[]);

      // Fetch matches
      const { data: matchesData } = await supabase
        .from('matches')
        .select('*, creator:profiles!matches_creator_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (matchesData) setMatches(matchesData as unknown as Match[]);

      // Fetch transactions - now protected by RLS, only admins can see all
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (transactionsData) setTransactions(transactionsData as Transaction[]);

      setLoading(false);
    };

    fetchData();
  }, [user, isAdmin]);

  const handleBanUser = async (userId: string, isBanned: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: !isBanned })
      .eq('user_id', userId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user status.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: isBanned ? 'User unbanned' : 'User banned',
        description: 'User status updated successfully.',
      });
      // Refresh users
      setUsers(users.map(u => 
        u.user_id === userId ? { ...u, is_banned: !isBanned } : u
      ));
    }
  };

  if (authLoading || isAdmin === null) return <MainLayout><LoadingPage /></MainLayout>;
  if (isAdmin !== true) return null;

  return (
    <MainLayout showChat={false}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-destructive/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Manage users, matches, and transactions</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{users.length}</p>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Swords className="w-8 h-8 text-accent" />
                <div>
                  <p className="text-2xl font-bold">{matches.length}</p>
                  <p className="text-sm text-muted-foreground">Total Matches</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <DollarSign className="w-8 h-8 text-success" />
                <div>
                  <p className="text-2xl font-bold">{transactions.length}</p>
                  <p className="text-sm text-muted-foreground">Transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <AlertTriangle className="w-8 h-8 text-warning" />
                <div>
                  <p className="text-2xl font-bold">
                    {matches.filter(m => m.status === 'disputed').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Disputes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                {loading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <div className="space-y-3">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={u.avatar_url ?? undefined} />
                            <AvatarFallback>{u.username?.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{u.username}</p>
                              {u.role === 'admin' && (
                                <Badge variant="destructive">Admin</Badge>
                              )}
                              {u.is_banned && (
                                <Badge variant="destructive">Banned</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        {u.role !== 'admin' && (
                          <Button
                            variant={u.is_banned ? 'outline' : 'destructive'}
                            size="sm"
                            onClick={() => handleBanUser(u.user_id, u.is_banned)}
                          >
                            {u.is_banned ? (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Unban
                              </>
                            ) : (
                              <>
                                <Ban className="w-4 h-4 mr-1" />
                                Ban
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="matches" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                {loading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <div className="space-y-3">
                    {matches.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{m.mode} - {m.region}</p>
                            <Badge variant={m.status === 'disputed' ? 'destructive' : 'default'}>
                              {m.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Created by {m.creator?.username} • {m.entry_fee} Coins
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                {loading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <div className="space-y-2">
                    {transactions.slice(0, 20).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                      >
                        <div>
                          <p className="font-medium capitalize">{tx.type}</p>
                          <p className="text-xs text-muted-foreground">{tx.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{tx.amount.toFixed(2)} Coins</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
