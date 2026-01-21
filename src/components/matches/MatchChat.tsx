import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Loader2, Lock, MessagesSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ChatMessage {
  id: string;
  match_id: string;
  user_id: string;
  message: string;
  is_system: boolean;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
}

interface MatchChatProps {
  matchId: string;
  matchStatus: string;
  currentUserId: string;
  isAdmin: boolean;
  isParticipant: boolean;
}

const ACTIVE_STATUSES = ['ready_check', 'in_progress', 'result_pending', 'disputed', 'full'];

export function MatchChat({ 
  matchId, 
  matchStatus, 
  currentUserId, 
  isAdmin, 
  isParticipant 
}: MatchChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const canSendMessage = (isParticipant || isAdmin) && ACTIVE_STATUSES.includes(matchStatus);
  const isReadOnly = !ACTIVE_STATUSES.includes(matchStatus);

  const fetchMessages = useCallback(async () => {
    try {
      const { data: messagesData, error } = await supabase
        .from('match_chat_messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!messagesData || messagesData.length === 0) {
        setMessages([]);
        return;
      }

      const userIds = [...new Set(messagesData.map(m => m.user_id))];
      
      const { data: profilesData } = await supabase
        .from('profiles_public')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);
      
      const enrichedMessages: ChatMessage[] = messagesData.map(msg => ({
        ...msg,
        username: profileMap.get(msg.user_id)?.username || 'Unknown',
        avatar_url: profileMap.get(msg.user_id)?.avatar_url || null,
      }));

      setMessages(enrichedMessages);
    } catch (error) {
      console.error('Error fetching chat messages:', error);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`match-chat-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_chat_messages',
          filter: `match_id=eq.${matchId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          
          const { data: profileData } = await supabase
            .from('profiles_public')
            .select('user_id, username, avatar_url')
            .eq('user_id', newMsg.user_id)
            .single();

          const enrichedMsg: ChatMessage = {
            ...newMsg,
            username: profileData?.username || 'Unknown',
            avatar_url: profileData?.avatar_url || null,
          };

          setMessages(prev => [...prev, enrichedMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending || !canSendMessage) return;

    const messageText = newMessage.trim();
    if (messageText.length > 500) {
      toast({
        title: 'Messaggio troppo lungo',
        description: 'Il messaggio non può superare i 500 caratteri.',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    setNewMessage('');

    try {
      const { error } = await supabase
        .from('match_chat_messages')
        .insert({
          match_id: matchId,
          user_id: currentUserId,
          message: messageText,
          is_system: false,
        });

      if (error) throw error;
    } catch (error: any) {
      console.error('Send message error:', error);
      setNewMessage(messageText);
      toast({
        title: 'Errore',
        description: 'Impossibile inviare il messaggio.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isParticipant && !isAdmin) return null;

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-secondary/30">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">Chat</span>
          <span className="text-xs text-muted-foreground">({messages.length})</span>
        </div>
        {isReadOnly && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/50 text-muted-foreground">
            <Lock className="w-3.5 h-3.5" />
            <span className="text-xs">Closed</span>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-2" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6">
            <MessagesSquare className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No messages</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const isOwnMessage = msg.user_id === currentUserId;
              
              if (msg.is_system) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-[10px] bg-secondary/50 px-2 py-1 rounded-full text-muted-foreground">
                      {msg.message}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2',
                    isOwnMessage && 'flex-row-reverse'
                  )}
                >
                  <Avatar className={cn(
                    "w-6 h-6 flex-shrink-0",
                    isOwnMessage ? "border border-accent/50" : "border border-border"
                  )}>
                    <AvatarImage src={msg.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px] font-bold">
                      {msg.username?.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className={cn(
                    'flex flex-col max-w-[80%]',
                    isOwnMessage && 'items-end'
                  )}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={cn(
                        'text-xs font-medium',
                        isOwnMessage ? 'text-accent' : 'text-foreground'
                      )}>
                        {msg.username}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </span>
                    </div>
                    <div className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs break-words',
                      isOwnMessage 
                        ? 'bg-accent text-accent-foreground rounded-tr-sm' 
                        : 'bg-secondary/70 text-foreground border border-border/30 rounded-tl-sm'
                    )}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      {canSendMessage ? (
        <div className="p-3 border-t border-border/30 bg-secondary/20">
          <div className="flex gap-2">
            <Input
              placeholder="Message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              maxLength={500}
              className="flex-1 h-9 text-sm bg-background/50 border-border/50"
            />
            <Button
              size="icon"
              className="h-9 w-9 bg-primary hover:bg-primary/90"
              onClick={handleSendMessage}
              disabled={sending || !newMessage.trim()}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      ) : isReadOnly ? (
        <div className="p-2 border-t border-border/30 bg-secondary/20 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" />
            Chat closed
          </p>
        </div>
      ) : null}
    </div>
  );
}
