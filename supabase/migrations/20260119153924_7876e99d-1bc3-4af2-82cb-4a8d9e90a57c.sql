-- Create match_chat_messages table for live match chat
CREATE TABLE public.match_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT message_length CHECK (LENGTH(message) <= 500)
);

-- Create index for faster queries
CREATE INDEX idx_match_chat_messages_match_id ON public.match_chat_messages(match_id);
CREATE INDEX idx_match_chat_messages_created_at ON public.match_chat_messages(created_at);

-- Enable RLS
ALTER TABLE public.match_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Participants and admins can view match chat messages
CREATE POLICY "Participants and admins can view match chat"
ON public.match_chat_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM match_participants WHERE match_id = match_chat_messages.match_id AND user_id = auth.uid()
  )
  OR is_admin()
);

-- Policy: Participants and admins can send messages (only when match is active)
CREATE POLICY "Participants and admins can send match chat"
ON public.match_chat_messages FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1 FROM match_participants WHERE match_id = match_chat_messages.match_id AND user_id = auth.uid()
    )
    OR is_admin()
  )
  AND EXISTS (
    SELECT 1 FROM matches WHERE id = match_chat_messages.match_id 
    AND status IN ('ready_check', 'in_progress', 'result_pending', 'disputed', 'full')
  )
);

-- Enable realtime for match chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_chat_messages;