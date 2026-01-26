-- Tabella per Stripe Connected Accounts (payout utenti)
CREATE TABLE public.stripe_connected_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    stripe_account_id TEXT NOT NULL UNIQUE,
    onboarding_complete BOOLEAN DEFAULT false,
    charges_enabled BOOLEAN DEFAULT false,
    payouts_enabled BOOLEAN DEFAULT false,
    requirements_due JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stripe_connected_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view own connected account
CREATE POLICY "Users can view own connected account"
ON public.stripe_connected_accounts
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all connected accounts"
ON public.stripe_connected_accounts
FOR SELECT
USING (public.is_admin());

-- Index for fast lookup
CREATE INDEX idx_stripe_connected_accounts_user ON public.stripe_connected_accounts(user_id);
CREATE INDEX idx_stripe_connected_accounts_stripe ON public.stripe_connected_accounts(stripe_account_id);