-- Add payment details to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS paypal_email TEXT,
ADD COLUMN IF NOT EXISTS iban TEXT;

-- Create withdrawal_requests table
CREATE TABLE public.withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 5),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('paypal', 'bank')),
    payment_details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES public.profiles(user_id)
);

-- Enable RLS
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own withdrawal requests
CREATE POLICY "Users can view own withdrawals"
ON public.withdrawal_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create withdrawal requests
CREATE POLICY "Users can create withdrawals"
ON public.withdrawal_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all withdrawal requests
CREATE POLICY "Admins can view all withdrawals"
ON public.withdrawal_requests
FOR SELECT
USING (public.is_admin());

-- Admins can update withdrawal requests
CREATE POLICY "Admins can update withdrawals"
ON public.withdrawal_requests
FOR UPDATE
USING (public.is_admin());

-- Create function to process withdrawal (admin only)
CREATE OR REPLACE FUNCTION public.process_withdrawal(
    p_withdrawal_id UUID,
    p_status TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_withdrawal RECORD;
    v_current_balance DECIMAL(10,2);
BEGIN
    -- Check if caller is admin
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- Get withdrawal request
    SELECT * INTO v_withdrawal
    FROM public.withdrawal_requests
    WHERE id = p_withdrawal_id
    FOR UPDATE;
    
    IF v_withdrawal IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Withdrawal not found');
    END IF;
    
    IF v_withdrawal.status != 'pending' THEN
        RETURN json_build_object('success', false, 'error', 'Withdrawal already processed');
    END IF;
    
    -- If approving, check and deduct balance
    IF p_status = 'approved' OR p_status = 'completed' THEN
        SELECT balance INTO v_current_balance
        FROM public.wallets
        WHERE user_id = v_withdrawal.user_id
        FOR UPDATE;
        
        IF v_current_balance < v_withdrawal.amount THEN
            RETURN json_build_object('success', false, 'error', 'Insufficient balance');
        END IF;
        
        -- Deduct from wallet
        UPDATE public.wallets
        SET balance = balance - v_withdrawal.amount,
            updated_at = now()
        WHERE user_id = v_withdrawal.user_id;
        
        -- Log transaction
        INSERT INTO public.transactions (user_id, type, amount, description)
        VALUES (v_withdrawal.user_id, 'payout', v_withdrawal.amount, 'Withdrawal processed');
    END IF;
    
    -- Update withdrawal request
    UPDATE public.withdrawal_requests
    SET status = p_status,
        admin_notes = p_admin_notes,
        processed_at = now(),
        processed_by = auth.uid()
    WHERE id = p_withdrawal_id;
    
    RETURN json_build_object('success', true);
END;
$$;