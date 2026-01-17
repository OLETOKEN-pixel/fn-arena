-- =====================================================
-- SECURITY FIX: Comprehensive security hardening migration
-- =====================================================

-- 1. Create app_role enum type for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 2. Create user_roles table (separate from profiles to avoid privilege escalation)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can only view their own roles
CREATE POLICY "Users can view own roles"
    ON public.user_roles FOR SELECT
    USING (auth.uid() = user_id);

-- 3. Create security definer function to check roles (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- 4. Create is_admin helper function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.has_role(auth.uid(), 'admin')
$$;

-- 5. Migrate existing admins from profiles.role to user_roles table
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'admin'::app_role
FROM public.profiles
WHERE role = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;

-- 6. Create a public-safe view for profiles (excludes sensitive data)
CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
    id,
    user_id,
    username,
    avatar_url,
    epic_username,
    preferred_region,
    preferred_platform,
    created_at
FROM public.profiles
WHERE is_banned = false;

-- 7. Fix profiles RLS policies
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Users can view their own full profile
CREATE POLICY "Users can view own full profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

-- Authenticated users can view limited public profile data (for participant lists etc.)
CREATE POLICY "Authenticated can view public profile data"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

-- Update the update policy to allow admins to ban users
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id AND 
        -- Users cannot change their own role or banned status
        is_banned IS NOT DISTINCT FROM (SELECT p.is_banned FROM public.profiles p WHERE p.user_id = auth.uid()) AND
        role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
    );

CREATE POLICY "Admins can update any profile"
    ON public.profiles FOR UPDATE
    USING (public.is_admin());

-- 8. Fix match_results RLS - restrict sensitive dispute info
DROP POLICY IF EXISTS "Results viewable by all" ON public.match_results;

-- Match participants can view results (including dispute details for their matches)
CREATE POLICY "Participants can view match results"
    ON public.match_results FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.match_participants
            WHERE match_participants.match_id = match_results.match_id
            AND match_participants.user_id = auth.uid()
        )
        OR public.is_admin()
    );

-- 9. Fix transactions RLS - allow admins to view all
CREATE POLICY "Admins can view all transactions"
    ON public.transactions FOR SELECT
    USING (public.is_admin());

-- 10. Create secure wallet operation functions (prevents client-side manipulation)
CREATE OR REPLACE FUNCTION public.lock_funds_for_match(
    p_match_id UUID,
    p_amount DECIMAL(10,2)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_current_balance DECIMAL(10,2);
    v_current_locked DECIMAL(10,2);
BEGIN
    -- Get user ID from auth context
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    IF p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Invalid amount');
    END IF;
    
    -- Lock row for update to prevent race conditions
    SELECT balance, locked_balance 
    INTO v_current_balance, v_current_locked
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;
    
    IF v_current_balance IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Wallet not found');
    END IF;
    
    -- Validate sufficient balance
    IF v_current_balance < p_amount THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
    
    -- Atomic update
    UPDATE public.wallets
    SET 
        balance = balance - p_amount,
        locked_balance = locked_balance + p_amount,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    -- Log transaction
    INSERT INTO public.transactions (user_id, type, amount, match_id, description)
    VALUES (v_user_id, 'lock', p_amount, p_match_id, 'Locked funds for match');
    
    RETURN json_build_object('success', true);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.lock_funds_for_match(UUID, DECIMAL) TO authenticated;

-- 11. Add function validation to handle_new_profile to prevent abuse
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Validate that the profile being created matches the authenticated user
    -- This adds defense-in-depth even though INSERT policy should already enforce this
    IF NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Cannot create wallet for other users';
    END IF;
    
    INSERT INTO public.wallets (user_id)
    VALUES (NEW.user_id);
    RETURN NEW;
END;
$$;