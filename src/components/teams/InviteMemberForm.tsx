import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface UserSuggestion {
  user_id: string;
  username: string;
  epic_username: string | null;
  avatar_url: string | null;
}

interface InviteMemberFormProps {
  teamId: string;
  onInviteSent?: () => void;
}

export function InviteMemberForm({ teamId, onInviteSent }: InviteMemberFormProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounced search
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('search_users_for_invite', {
        p_team_id: teamId,
        p_search_term: searchTerm,
      });

      if (!error && data) {
        setSuggestions(data as UserSuggestion[]);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, teamId]);

  const handleInvite = async (userId: string, username: string) => {
    setInviting(userId);
    try {
      const { data, error } = await supabase.rpc('send_team_invite', {
        p_team_id: teamId,
        p_invitee_user_id: userId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string } | null;
      if (result && !result.success) {
        throw new Error(result.error);
      }

      toast({
        title: 'Invite sent!',
        description: `${username} has been invited to your team.`,
      });

      // Remove from suggestions
      setSuggestions(prev => prev.filter(s => s.user_id !== userId));
      setSearchTerm('');
      setShowSuggestions(false);
      onInviteSent?.();
    } catch (error) {
      toast({
        title: 'Failed to invite',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setInviting(null);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by username..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          className="pl-10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {suggestions.map((user) => (
            <div
              key={user.user_id}
              className={cn(
                "flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors cursor-pointer",
                inviting === user.user_id && "opacity-50 pointer-events-none"
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={user.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {user.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user.username}</p>
                  {user.epic_username && (
                    <p className="text-xs text-muted-foreground">
                      Epic: {user.epic_username}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleInvite(user.user_id, user.username)}
                disabled={inviting === user.user_id}
              >
                {inviting === user.user_id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-1" />
                    Invite
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {showSuggestions && searchTerm.length >= 2 && !loading && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg z-50 p-4 text-center text-muted-foreground">
          No users found matching "{searchTerm}"
        </div>
      )}

      {/* Click outside to close */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowSuggestions(false)}
        />
      )}
    </div>
  );
}
