import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Trophy, AlertTriangle, Info, CheckCheck, Settings, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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
      return 'text-blue-400';
    case 'warning':
    case 'dispute':
      return 'text-red-400';
    default:
      return 'text-primary';
  }
};

export function NotificationsDropdown() {
  const { notifications, unreadCount, loading, markAllAsRead, markAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
    if (!isRead) {
      await markAsRead(notificationId);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="w-80 p-0 bg-card border-border shadow-xl"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold">Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-8 text-xs"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                Mark all read
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link to="/notifications">
                <Settings className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="max-h-96">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.slice(0, 15).map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                const iconColor = getNotificationColor(notification.type);
                const payload = notification.payload as { match_id?: string; team_id?: string } | null;

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification.id, notification.is_read ?? false)}
                    className={cn(
                      'flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/50',
                      !notification.is_read && 'bg-primary/5'
                    )}
                  >
                    <div className={cn('flex-shrink-0 mt-0.5', iconColor)}>
                      <Icon className="w-4 h-4" />
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
                    </div>
                    {/* Quick action for match notifications */}
                    {payload?.match_id && (
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

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <Link
              to="/notifications"
              className="text-xs text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
