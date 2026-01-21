-- Fix ambiguous overloads for create_match_1v1 by enforcing a single canonical signature

-- 1) Drop all known overloads (order+types) to remove ambiguity
DROP FUNCTION IF EXISTS public.create_match_1v1(text, text, text, integer, numeric, boolean);
DROP FUNCTION IF EXISTS public.create_match_1v1(numeric, text, text, text, integer, boolean);

-- 2) Recreate ONE canonical create_match_1v1 signature (numeric entry fee; jsonb return)
CREATE OR REPLACE FUNCTION public.create_match_1v1(
  p_entry_fee numeric,
  p_region text,
  p_platform text,
  p_mode text,
  p_first_to integer DEFAULT 3,
  p_is_private boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match_id uuid;
  v_balance numeric;
  v_expires_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Ensure caller does not already have an active match
  IF public.has_active_match(v_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Hai già un match attivo. Completa o cancella il match esistente prima di crearne uno nuovo.'
    );
  END IF;

  -- Check balance
  SELECT balance INTO v_balance FROM wallets WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_entry_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insufficiente');
  END IF;

  -- Same base expiry behavior as team matches
  v_expires_at := now() + interval '30 minutes';

  INSERT INTO matches (
    creator_id,
    game,
    region,
    platform,
    mode,
    team_size,
    first_to,
    entry_fee,
    is_private,
    status,
    expires_at,
    payment_mode_host,
    host_payer_user_id,
    captain_a_user_id
  ) VALUES (
    v_user_id,
    'FN',
    p_region,
    p_platform,
    p_mode,
    1,
    p_first_to,
    p_entry_fee,
    p_is_private,
    'open',
    v_expires_at,
    'cover',
    v_user_id,
    v_user_id
  )
  RETURNING id INTO v_match_id;

  -- Lock funds
  UPDATE wallets
  SET balance = balance - p_entry_fee,
      locked_balance = locked_balance + p_entry_fee,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Record transaction (amount positive, consistent with team refund logic)
  INSERT INTO transactions (user_id, type, amount, description, match_id, status)
  VALUES (v_user_id, 'lock', p_entry_fee, 'Entry fee locked', v_match_id, 'completed');

  -- Add creator as participant
  INSERT INTO match_participants (match_id, user_id, team_side, status)
  VALUES (v_match_id, v_user_id, 'A', 'joined');

  RETURN jsonb_build_object('success', true, 'match_id', v_match_id);
END;
$$;

-- 3) Optional: provide a non-overloaded legacy wrapper for older call patterns
CREATE OR REPLACE FUNCTION public.create_match_1v1_legacy(
  p_region text,
  p_platform text,
  p_mode text,
  p_first_to integer,
  p_entry_fee numeric,
  p_is_private boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_match_1v1(
    p_entry_fee := p_entry_fee,
    p_region := p_region,
    p_platform := p_platform,
    p_mode := p_mode,
    p_first_to := p_first_to,
    p_is_private := p_is_private
  );
END;
$$;