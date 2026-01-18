-- Add PayPal support columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'stripe';

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT;

-- Add index for PayPal order lookup (idempotency)
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_order_id ON public.transactions(paypal_order_id) WHERE paypal_order_id IS NOT NULL;