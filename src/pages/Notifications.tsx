import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, Check, X, Users, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

export default function Notifications() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { notifications, loading, markAsRead, markAllAsRead, respondToInvite, unreadCount } = useNotifications();
  const { toast } = useToast();
  const [responding, setResponding] = useState<string | null>(null);

  if (!user && !authLoading) {
    navigate('/auth');
    return null;
  }

  const handleRespond = async (notification: Notification, action: 'accept' | 'decline') => {
    if (!notification.payload.team_id) return;
    
    setResponding(notification.id);
    try {
      await respondToInvite(notification.payload.team_id, action);
      await markAsRead(notification.id);
      
      toast({
        title: action === 'accept' ? 'Joined Team!' : 'Invite Declined',
        description: action === 'accept' 
          ? `You are now a member of ${notification.payload.team_name}` 
          : 'The invite has been declined.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to respond to invite',
        variant: 'destructive',
      });
    } finally {
      setResponding(null);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'team_invite':
        return <Users className="w-5 h-5 text-primary" />;
      case 'invite_accepted':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'invite_declined':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'removed_from_team':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'member_left':
        return <Users className="w-5 h-5 text-muted-foreground" />;
      default:
        return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  if (authLoading) {
    return <MainLayout><Skeleton className="h-96" /></MainLayout>;
  }

  return (
    <MainLayout showChat={false}>
      {/* Centered container for narrower content */}
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead}>
              <Check className="w-4 h-4 mr-2" />
              Mark All Read
            </Button>
          )}
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Notifications</h3>
              <p className="text-muted-foreground">
                You're all caught up! Check back later for updates.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={cn(
                  "bg-card border-border transition-colors",
                  !notification.is_read && "border-l-4 border-l-primary bg-primary/5"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-secondary">
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{notification.title}</h4>
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </div>
                      
                      {/* Team Invite Actions */}
                      {notification.type === 'team_invite' && (
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => handleRespond(notification, 'accept')}
                            disabled={responding === notification.id}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRespond(notification, 'decline')}
                            disabled={responding === notification.id}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                          {notification.payload.team_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                            >
                              <Link to={`/teams/${notification.payload.team_id}`}>
                                View Team
                              </Link>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {!notification.is_read && notification.type !== 'team_invite' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => markAsRead(notification.id)}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
