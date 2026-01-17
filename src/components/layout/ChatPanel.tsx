import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { ChatMessage, Profile } from '@/types';

interface ChatMessageWithProfile extends ChatMessage {
  profiles: Profile;
}

interface ChatPanelProps {
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ChatPanel({ className, isOpen = true, onClose }: ChatPanelProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessageWithProfile[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const RATE_LIMIT_MS = 3000; // 3 seconds between messages

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, profiles:user_id(*)')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setMessages((data as unknown as ChatMessageWithProfile[]).reverse());
      }
    };

    fetchMessages();
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('chat_messages_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          // Fetch the profile for the new message
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', payload.new.user_id)
            .single();

          if (profileData) {
            const newMsg = {
              ...payload.new,
              profiles: profileData,
            } as ChatMessageWithProfile;
            
            setMessages((prev) => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !profile || !newMessage.trim()) return;

    const now = Date.now();
    if (now - lastSent < RATE_LIMIT_MS) {
      return; // Rate limited
    }

    setSending(true);
    setLastSent(now);

    const { error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        message: newMessage.trim(),
      });

    if (!error) {
      setNewMessage('');
    }

    setSending(false);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOpen) return null;

  return (
    <aside className={cn(
      'flex flex-col bg-[hsl(var(--chat-background))] border-l border-border',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Global Chat</h3>
          <span className="px-2 py-0.5 text-xs bg-success/20 text-success rounded-full">
            LIVE
          </span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-3">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarImage src={msg.profiles?.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs bg-secondary">
                  {msg.profiles?.username?.charAt(0).toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm text-primary">
                    {msg.profiles?.username ?? 'Unknown'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 break-words">
                  {msg.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border">
        {user ? (
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              disabled={sending}
              className="flex-1 bg-secondary border-none"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={sending || !newMessage.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            <a href="/auth" className="text-primary hover:underline">
              Sign in
            </a>
            {' '}to send messages
          </div>
        )}
      </div>
    </aside>
  );
}
