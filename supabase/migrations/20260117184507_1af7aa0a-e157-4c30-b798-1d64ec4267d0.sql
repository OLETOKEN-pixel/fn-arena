-- Tabella per il saldo della piattaforma (singolo record)
CREATE TABLE public.platform_wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserisci il record iniziale
INSERT INTO public.platform_wallet (balance) VALUES (0);

-- Tabella per tracciare ogni singola fee raccolta
CREATE TABLE public.platform_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id),
  amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_earnings ENABLE ROW LEVEL SECURITY;

-- Solo admin possono vedere il wallet della piattaforma
CREATE POLICY "Admins can view platform wallet"
ON public.platform_wallet FOR SELECT
USING (public.is_admin());

-- Solo admin possono vedere i guadagni
CREATE POLICY "Admins can view platform earnings"
ON public.platform_earnings FOR SELECT
USING (public.is_admin());

-- Trigger per updated_at
CREATE TRIGGER update_platform_wallet_updated_at
BEFORE UPDATE ON public.platform_wallet
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Funzione per registrare una fee della piattaforma (chiamata quando si conclude un match)
CREATE OR REPLACE FUNCTION public.record_platform_fee(p_match_id UUID, p_fee_amount NUMERIC)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Registra la fee
    INSERT INTO public.platform_earnings (match_id, amount)
    VALUES (p_match_id, p_fee_amount);
    
    -- Aggiorna il saldo della piattaforma
    UPDATE public.platform_wallet
    SET balance = balance + p_fee_amount,
        updated_at = now();
    
    RETURN json_build_object('success', true);
END;
$$;

-- Funzione per prelevare i guadagni della piattaforma (solo admin)
CREATE OR REPLACE FUNCTION public.withdraw_platform_earnings(p_amount NUMERIC, p_payment_method TEXT, p_payment_details TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_current_balance NUMERIC;
BEGIN
    -- Verifica che sia admin
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- Ottieni il saldo corrente
    SELECT balance INTO v_current_balance
    FROM public.platform_wallet
    FOR UPDATE;
    
    IF v_current_balance < p_amount THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient platform balance');
    END IF;
    
    -- Scala dal wallet della piattaforma
    UPDATE public.platform_wallet
    SET balance = balance - p_amount,
        updated_at = now();
    
    -- Crea una richiesta di prelievo speciale per la piattaforma
    -- Usiamo l'user_id dell'admin che fa la richiesta
    INSERT INTO public.withdrawal_requests (user_id, amount, payment_method, payment_details, status, admin_notes)
    VALUES (auth.uid(), p_amount, p_payment_method, p_payment_details, 'pending', 'Platform earnings withdrawal');
    
    RETURN json_build_object('success', true);
END;
$$;