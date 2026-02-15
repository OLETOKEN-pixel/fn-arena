import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Trophy, AlertTriangle, Info, CheckCheck, Loader2, Users, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useNotifications } from '@/hooks/useNotifications';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

type FilterType = 'all' | 'unread' | 'invites';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'match_result':
    case 'match_win':
    case 'challenge_complete':
      return Trophy;
    case 'team_invite':
      return Users;
    case 'warning':
    case 'dispute':
      return AlertTriangle;
    default:
      return Info;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'match_result':
    case 'match_win':
    case 'challenge_complete':
      return 'text-yellow-400';
    case 'team_invite':
      return 'text-primary';
    case 'warning':
    case 'dispute':
      return 'text-red-400';
    default:
      return 'text-primary';
  }
};

function NotificationsContent({ 
  onClose 
}: { 
  onClose?: () => void;
}) {
  const { notifications, unreadCount, loading, markAllAsRead, markAsRead, respondToInvite, refresh } = useNotifications();
  const [filter, setFilter] = useState<FilterType>('all');
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
    if (!isRead) {
      await markAsRead(notificationId);
    }
  };

  const handleRespondToInvite = async (teamId: string, action: 'accept' | 'decline', notificationId: string) => {
    setRespondingTo(notificationId);
    try {
      await respondToInvite(teamId, action);
      await markAsRead(notificationId);
      toast.success(action === 'accept' ? 'Team invite accepted!' : 'Team invite declined');
      await refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to respond to invite');
    } finally {
      setRespondingTo(null);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'invites') return n.type === 'team_invite';
    return true;
  });

  const inviteCount = notifications.filter(n => n.type === 'team_invite' && !n.is_read).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/15 text-primary rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-7 text-xs">
            <CheckCheck className="w-3 h-3 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.03]">
        <Button
          variant={filter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilter('all')}
          className="h-7 text-xs"
        >
          All
        </Button>
        <Button
          variant={filter === 'unread' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilter('unread')}
          className="h-7 text-xs"
        >
          Unread
          {unreadCount > 0 && (
            <span className="ml-1 px-1 py-0.5 text-[10px] bg-primary/15 text-primary rounded-full">
              {unreadCount}
            </span>
          )}
        </Button>
        <Button
          variant={filter === 'invites' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilter('invites')}
          className="h-7 text-xs"
        >
          <Users className="w-3 h-3 mr-1" />
          Invites
          {inviteCount > 0 && (
            <span className="ml-1 px-1 py-0.5 text-[10px] bg-accent/15 text-accent rounded-full">
              {inviteCount}
            </span>
          )}
        </Button>
      </div>

      {/* Notifications List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-secondary flex items-center justify-center">
              <Bell className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              {filter === 'all' && 'No notifications yet'}
              {filter === 'unread' && 'All caught up!'}
              {filter === 'invites' && 'No team invites'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {filteredNotifications.slice(0, 20).map((notification) => {
              const Icon = getNotificationIcon(notification.type);
              const iconColor = getNotificationColor(notification.type);
              const payload = notification.payload as { match_id?: string; team_id?: string } | null;
              const isTeamInvite = notification.type === 'team_invite';
              const isResponding = respondingTo === notification.id;

              return (
                <div
                  key={notification.id}
                  onClick={() => !isTeamInvite && handleNotificationClick(notification.id, notification.is_read ?? false)}
                  className={cn(
                    'flex gap-3 px-4 py-3 transition-colors',
                    !notification.is_read && 'bg-white/[0.02]',
                    !isTeamInvite && 'cursor-pointer hover:bg-white/[0.03]'
                  )}
                >
                  <div className={cn('flex-shrink-0 mt-0.5', iconColor)}>
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center',
                      !notification.is_read && 'bg-primary/8'
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm',
                      !notification.is_read && 'font-medium'
                    )}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at || Date.now()), { addSuffix: true })}
                    </p>

                    {isTeamInvite && payload?.team_id && !notification.is_read && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRespondToInvite(payload.team_id!, 'accept', notification.id);
                          }}
                          disabled={isResponding}
                          className="h-7 text-xs"
                        >
                          {isResponding ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Accept
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRespondToInvite(payload.team_id!, 'decline', notification.id);
                          }}
                          disabled={isResponding}
                          className="h-7 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>

                  {payload?.match_id && !isTeamInvite && (
                    <Link
                      to={`/matches/${payload.match_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline self-center"
                    >
                      View
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function NotificationsDropdown() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const triggerButton = (
    <Button variant="ghost" size="icon" className="relative">
      <Bell className={cn(
        "w-5 h-5 transition-all",
        unreadCount > 0 && "animate-bell-ring"
      )} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[10px] font-bold bg-destructive text-white rounded-full">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          {triggerButton}
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <div className="w-10 h-1 bg-muted rounded-full mx-auto mt-2 mb-1" />
          <NotificationsContent onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="w-[400px] p-0 bg-[hsl(240_8%_6%)] border-white/[0.06] shadow-[0_16px_48px_rgba(0,0,0,0.7)] max-h-[550px] flex flex-col"
        sideOffset={8}
      >
        <NotificationsContent onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
