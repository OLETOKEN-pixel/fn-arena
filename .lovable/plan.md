
# Piano: Migrazione Completa a Stripe (Rimozione PayPal Diretto + Stripe Connect per Payout)

## Panoramica

Questo piano elimina completamente l'integrazione PayPal diretta, abilita PayPal come metodo di pagamento **tramite Stripe Checkout**, implementa **Stripe Connect Express** per i payout agli utenti, e introduce le nuove regole di commissioni e minimi.

---

## FASE 1: Rimozione Completa PayPal Diretto

### 1.1 Edge Functions da Eliminare

| File | Azione |
|------|--------|
| `supabase/functions/create-paypal-order/` | Eliminare intera cartella |
| `supabase/functions/capture-paypal-order/` | Eliminare intera cartella |
| `supabase/functions/paypal-webhook/` | Eliminare intera cartella |

### 1.2 Aggiornamento `supabase/config.toml`

Rimuovere le configurazioni PayPal:

```toml
project_id = "xiofbauhzbqmienrjljb"

[functions.create-checkout]
verify_jwt = false

[functions.stripe-webhook]
verify_jwt = false

[functions.expire-matches]
verify_jwt = false

[functions.discord-auth-start]
verify_jwt = false

[functions.discord-auth-callback]
verify_jwt = false

[functions.create-stripe-connect-account]
verify_jwt = false

[functions.create-stripe-payout]
verify_jwt = false
```

### 1.3 Secrets da Rimuovere (Manuale da Dashboard)

I seguenti secrets dovranno essere rimossi manualmente:
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_MODE`
- `PAYPAL_WEBHOOK_ID`

---

## FASE 2: Fix Stripe Checkout (PayPal Visibile + Email Modificabile)

### 2.1 Modifiche a `supabase/functions/create-checkout/index.ts`

**Problemi attuali:**
1. `payment_method_types: ["card"]` - blocca PayPal
2. `customer: customerId` - blocca modifica email
3. Nessuna commissione fissa
4. Minimo 1 coin invece di 5

**Nuova implementazione:**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROCESSING_FEE = 0.50; // Commissione fissa 0,50€
const MIN_COINS = 5; // Minimo acquisto 5 coins
const PRODUCTION_DOMAIN = "https://oleboytoken.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Payment system not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { amount } = await req.json();
    
    // Validazione: minimo 5 coins
    if (!amount || amount < MIN_COINS) {
      return new Response(
        JSON.stringify({ error: `Minimo acquisto: ${MIN_COINS} Coins (€${MIN_COINS})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const origin = req.headers.get("origin") || PRODUCTION_DOMAIN;
    const totalAmount = amount + PROCESSING_FEE;

    // NON passare customer per permettere modifica email
    // Usare customer_email solo per precompilare (opzionale)
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email, // Precompila ma modificabile
      // NO customer: customerId - questo blocca la modifica email
      
      // Abilita tutti i metodi di pagamento configurati (incluso PayPal)
      payment_method_types: ["card", "paypal"],
      // Alternativa: automatic_payment_methods: { enabled: true },
      
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `${amount} Coins`,
              description: "OLEBOY TOKEN Gaming Coins",
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Commissione di servizio",
              description: "Processing fee",
            },
            unit_amount: Math.round(PROCESSING_FEE * 100), // 50 centesimi
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment/success?provider=stripe&success=true&coins=${amount}`,
      cancel_url: `${origin}/buy?canceled=true`,
      metadata: {
        user_id: user.id,
        coins: amount.toString(),
        fee: PROCESSING_FEE.toString(),
      },
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## FASE 3: Aggiornamento UI Acquisto Coins

### 3.1 Modifiche a `src/pages/BuyCoins.tsx`

**Cambiamenti principali:**
1. Rimuovere selezione PayPal/Stripe (solo Stripe con PayPal integrato)
2. Minimo 5 coins
3. Mostrare commissione 0,50€ nel riepilogo
4. Aggiornare `COIN_PACKAGES` per rimuovere pacchetti < 5

```typescript
// Stato semplificato - rimuovere paymentMethod
const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
const [customAmount, setCustomAmount] = useState('');
const [processing, setProcessing] = useState(false);

const PROCESSING_FEE = 0.50;
const MIN_COINS = 5;

const finalAmount = customAmount ? parseFloat(customAmount) : (selectedPackage?.coins ?? 0);
const finalPrice = finalAmount + PROCESSING_FEE;

const handleCheckout = async () => {
  if (!user) {
    navigate('/auth');
    return;
  }

  if (finalAmount < MIN_COINS) {
    toast({
      title: 'Importo non valido',
      description: `Il minimo acquisto è di ${MIN_COINS} Coins.`,
      variant: 'destructive',
    });
    return;
  }

  setProcessing(true);
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { amount: finalAmount },
    });

    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    toast({
      title: 'Errore',
      description: 'Impossibile avviare il pagamento.',
      variant: 'destructive',
    });
    setProcessing(false);
  }
};
```

**UI riepilogo checkout:**

```tsx
<Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
  <CardContent className="py-6">
    <div className="space-y-3 mb-4">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Coins</span>
        <span>€{finalAmount.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Commissione</span>
        <span>€{PROCESSING_FEE.toFixed(2)}</span>
      </div>
      <div className="border-t border-border pt-2 flex justify-between font-bold">
        <span>Totale</span>
        <span>€{finalPrice.toFixed(2)}</span>
      </div>
    </div>
    
    <div className="text-center mb-4">
      <p className="text-sm text-muted-foreground">Riceverai</p>
      <CoinDisplay amount={finalAmount} size="lg" className="glow-text-gold" />
    </div>
    
    <Button
      size="lg"
      className="w-full"
      onClick={handleCheckout}
      disabled={processing || finalAmount < MIN_COINS}
    >
      {processing ? 'Elaborazione...' : 'Paga ora'}
    </Button>
    
    <p className="text-xs text-center text-muted-foreground mt-4">
      Pagamento sicuro tramite Stripe • Carta o PayPal
    </p>
  </CardContent>
</Card>
```

### 3.2 Aggiornamento `src/types/index.ts`

Modificare `COIN_PACKAGES` per rimuovere pacchetti inferiori a 5:

```typescript
export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'pack-5', coins: 5, price: 5 },
  { id: 'pack-10', coins: 10, price: 10, popular: true },
  { id: 'pack-15', coins: 15, price: 15 },
  { id: 'pack-20', coins: 20, price: 20 },
  { id: 'pack-25', coins: 25, price: 25 },
  { id: 'pack-50', coins: 50, price: 50, bonus: 5 },
];
```

---

## FASE 4: Stripe Connect per Payout

### 4.1 Nuova Tabella Database

Migrazione SQL per tracciare gli account Stripe Connect:

```sql
-- Tabella per Stripe Connected Accounts
CREATE TABLE public.stripe_connected_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE UNIQUE,
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

-- Indice per lookup veloce
CREATE INDEX idx_stripe_connected_accounts_user ON public.stripe_connected_accounts(user_id);

-- Aggiornare withdrawal_requests per supportare Stripe
ALTER TABLE public.withdrawal_requests 
DROP CONSTRAINT IF EXISTS withdrawal_requests_payment_method_check;

ALTER TABLE public.withdrawal_requests
ADD CONSTRAINT withdrawal_requests_payment_method_check 
CHECK (payment_method IN ('stripe'));

-- Aggiornare minimo prelievo a 10€
ALTER TABLE public.withdrawal_requests 
DROP CONSTRAINT IF EXISTS withdrawal_requests_amount_check;

ALTER TABLE public.withdrawal_requests
ADD CONSTRAINT withdrawal_requests_amount_check 
CHECK (amount >= 10);
```

### 4.2 Edge Function: `create-stripe-connect-account`

Crea un account Express e genera il link di onboarding:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    let stripeAccountId: string;

    if (existingAccount?.stripe_account_id) {
      stripeAccountId = existingAccount.stripe_account_id;
    } else {
      // Create Express account
      const account = await stripe.accounts.create({
        type: "express",
        country: "IT", // o dinamico
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          supabase_user_id: user.id,
        },
      });

      stripeAccountId = account.id;

      // Save to DB
      await supabase.from("stripe_connected_accounts").insert({
        user_id: user.id,
        stripe_account_id: account.id,
        onboarding_complete: false,
      });
    }

    // Generate account link for onboarding
    const origin = req.headers.get("origin") || "https://oleboytoken.com";
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${origin}/wallet?stripe_refresh=true`,
      return_url: `${origin}/wallet?stripe_onboarding=complete`,
      type: "account_onboarding",
    });

    return new Response(
      JSON.stringify({ url: accountLink.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### 4.3 Edge Function: `create-stripe-payout`

Esegue il transfer verso l'account connesso:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_WITHDRAWAL = 10;
const WITHDRAWAL_FEE = 0.50;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { amount } = await req.json();

    // Validazioni
    if (!amount || amount < MIN_WITHDRAWAL) {
      return new Response(
        JSON.stringify({ error: `Minimo prelievo: €${MIN_WITHDRAWAL}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalDeduction = amount + WITHDRAWAL_FEE;

    // Check wallet balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (!wallet || wallet.balance < totalDeduction) {
      return new Response(
        JSON.stringify({ error: "Saldo insufficiente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Stripe connected account
    const { data: connectedAccount } = await supabase
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!connectedAccount?.payouts_enabled) {
      return new Response(
        JSON.stringify({ error: "Completa la verifica Stripe per prelevare" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Centesimi
      currency: "eur",
      destination: connectedAccount.stripe_account_id,
      metadata: {
        user_id: user.id,
        withdrawal_amount: amount.toString(),
        fee: WITHDRAWAL_FEE.toString(),
      },
    });

    // Deduct from wallet (amount + fee)
    await supabase
      .from("wallets")
      .update({ balance: wallet.balance - totalDeduction })
      .eq("user_id", user.id);

    // Create withdrawal request record
    await supabase.from("withdrawal_requests").insert({
      user_id: user.id,
      amount: amount,
      payment_method: "stripe",
      payment_details: connectedAccount.stripe_account_id,
      status: "completed",
    });

    // Log transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "payout",
      amount: -totalDeduction,
      description: `Prelievo €${amount} (+ €${WITHDRAWAL_FEE} commissione)`,
      provider: "stripe",
      status: "completed",
    });

    return new Response(
      JSON.stringify({ success: true, transferId: transfer.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### 4.4 Webhook Stripe per account.updated

Aggiungere handler in `stripe-webhook/index.ts`:

```typescript
// Handle account.updated (Stripe Connect)
if (event.type === "account.updated") {
  const account = event.data.object as Stripe.Account;
  
  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;
  const requirementsDue = account.requirements?.currently_due || [];

  // Update connected account status
  await supabase
    .from("stripe_connected_accounts")
    .update({
      onboarding_complete: chargesEnabled && payoutsEnabled,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      requirements_due: requirementsDue,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id);
}
```

---

## FASE 5: Aggiornamento UI Wallet e Profilo

### 5.1 Modifiche a `src/pages/Wallet.tsx`

Rimuovere PayPal/Bank e implementare Stripe Connect:

```typescript
// Nuovo stato
const [stripeAccount, setStripeAccount] = useState<{
  onboarding_complete: boolean;
  payouts_enabled: boolean;
} | null>(null);
const [connectingStripe, setConnectingStripe] = useState(false);

const MIN_WITHDRAWAL = 10;
const WITHDRAWAL_FEE = 0.50;

// Fetch Stripe account status
useEffect(() => {
  if (!user) return;
  
  const fetchStripeAccount = async () => {
    const { data } = await supabase
      .from('stripe_connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    
    setStripeAccount(data);
  };
  
  fetchStripeAccount();
}, [user]);

// Connect to Stripe
const handleConnectStripe = async () => {
  setConnectingStripe(true);
  try {
    const { data, error } = await supabase.functions.invoke('create-stripe-connect-account');
    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    toast({ title: 'Errore', description: 'Impossibile avviare la verifica', variant: 'destructive' });
  } finally {
    setConnectingStripe(false);
  }
};

// Withdraw
const handleWithdraw = async () => {
  const amount = parseFloat(withdrawAmount);
  const totalDeduction = amount + WITHDRAWAL_FEE;
  
  if (amount < MIN_WITHDRAWAL) {
    toast({ title: 'Errore', description: `Minimo prelievo: €${MIN_WITHDRAWAL}`, variant: 'destructive' });
    return;
  }
  
  if (totalDeduction > (wallet?.balance ?? 0)) {
    toast({ title: 'Errore', description: 'Saldo insufficiente (inclusa commissione €0,50)', variant: 'destructive' });
    return;
  }

  setSubmitting(true);
  try {
    const { data, error } = await supabase.functions.invoke('create-stripe-payout', {
      body: { amount },
    });
    
    if (error) throw error;
    toast({ title: 'Prelievo completato', description: `€${amount} trasferiti al tuo account` });
    setWithdrawOpen(false);
    refreshWallet();
  } catch (error) {
    toast({ title: 'Errore', description: 'Impossibile completare il prelievo', variant: 'destructive' });
  } finally {
    setSubmitting(false);
  }
};
```

**UI Prelievo:**

```tsx
{/* Sezione Prelievo */}
<Card className="bg-card border-border">
  <CardContent className="py-6">
    <h3 className="font-semibold mb-2">Preleva</h3>
    
    {!stripeAccount?.payouts_enabled ? (
      // Non verificato - mostra CTA
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Completa la verifica per ricevere i tuoi pagamenti
        </p>
        <Button onClick={handleConnectStripe} disabled={connectingStripe}>
          {connectingStripe ? 'Caricamento...' : 'Completa Verifica su Stripe'}
        </Button>
      </div>
    ) : (
      // Verificato - mostra form prelievo
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogTrigger asChild>
          <Button disabled={(wallet?.balance ?? 0) < MIN_WITHDRAWAL + WITHDRAWAL_FEE}>
            Preleva
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Richiedi Prelievo</DialogTitle>
            <DialogDescription>
              Minimo €{MIN_WITHDRAWAL} • Commissione €{WITHDRAWAL_FEE}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input
                type="number"
                min={MIN_WITHDRAWAL}
                max={(wallet?.balance ?? 0) - WITHDRAWAL_FEE}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="10.00"
              />
            </div>
            
            {withdrawAmount && parseFloat(withdrawAmount) >= MIN_WITHDRAWAL && (
              <div className="p-3 bg-secondary rounded-lg space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Importo richiesto</span>
                  <span>€{parseFloat(withdrawAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Commissione</span>
                  <span>€{WITHDRAWAL_FEE.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium border-t border-border pt-1">
                  <span>Scalato dal saldo</span>
                  <span>€{(parseFloat(withdrawAmount) + WITHDRAWAL_FEE).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Annulla</Button>
            <Button onClick={handleWithdraw} disabled={submitting}>
              {submitting ? 'Elaborazione...' : 'Conferma Prelievo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
  </CardContent>
</Card>
```

### 5.2 Modifiche a `src/pages/Profile.tsx`

Rimuovere sezione PayPal email dalla sezione Pagamenti e sostituire con stato Stripe Connect:

```tsx
{/* Payments Section - STRIPE CONNECT */}
{activeSection === 'payments' && (
  <div className="space-y-5">
    <h2 className="text-lg font-semibold">Metodo di Prelievo</h2>
    
    <div className="p-4 rounded-lg bg-secondary/50 border border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-medium">Stripe Connect</p>
            <p className="text-sm text-muted-foreground">
              Ricevi i pagamenti direttamente sul tuo conto
            </p>
          </div>
        </div>
        
        {stripeAccount?.payouts_enabled ? (
          <Badge className="text-green-500 border-green-500/50">
            <Check className="w-3 h-3 mr-1" /> Verificato
          </Badge>
        ) : (
          <Button size="sm" onClick={handleConnectStripe}>
            Configura
          </Button>
        )}
      </div>
    </div>
    
    <p className="text-sm text-muted-foreground">
      Stripe gestisce in modo sicuro i tuoi dati bancari e le verifiche KYC.
      I prelievi vengono trasferiti direttamente sul tuo conto.
    </p>
  </div>
)}
```

---

## FASE 6: Cleanup Codice Residuo

### 6.1 File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/PaymentSuccess.tsx` | Rimuovere logica PayPal capture, mantenere solo Stripe |
| `src/pages/Admin.tsx` | Rimuovere filtro "paypal" dai payment logs |
| `src/pages/Terms.tsx` | Aggiornare testo da "PayPal" a "Stripe" |
| `src/types/index.ts` | Rimuovere tipo `WithdrawalRequest.payment_method: 'paypal'` |

### 6.2 Aggiornamento `src/pages/PaymentSuccess.tsx`

Semplificare rimuovendo logica PayPal:

```typescript
useEffect(() => {
  const handlePayment = async () => {
    const success = searchParams.get('success');
    const coins = searchParams.get('coins');
    const canceled = searchParams.get('canceled');

    if (canceled === 'true') {
      setErrorMessage('Pagamento annullato');
      setStatus('error');
      return;
    }

    if (success === 'true') {
      setCoins(parseFloat(coins || '0'));
      setStatus('success');
      await refreshWallet();
      return;
    }

    // Stato sconosciuto
    setStatus('success');
  };

  if (user) {
    handlePayment();
  } else {
    navigate('/auth');
  }
}, [searchParams, user, navigate, refreshWallet]);
```

---

## Riepilogo File da Modificare/Creare

| Azione | File |
|--------|------|
| **ELIMINARE** | `supabase/functions/create-paypal-order/` |
| **ELIMINARE** | `supabase/functions/capture-paypal-order/` |
| **ELIMINARE** | `supabase/functions/paypal-webhook/` |
| **MODIFICARE** | `supabase/config.toml` |
| **MODIFICARE** | `supabase/functions/create-checkout/index.ts` |
| **MODIFICARE** | `supabase/functions/stripe-webhook/index.ts` |
| **CREARE** | `supabase/functions/create-stripe-connect-account/index.ts` |
| **CREARE** | `supabase/functions/create-stripe-payout/index.ts` |
| **MODIFICARE** | `src/pages/BuyCoins.tsx` |
| **MODIFICARE** | `src/pages/Wallet.tsx` |
| **MODIFICARE** | `src/pages/Profile.tsx` |
| **MODIFICARE** | `src/pages/PaymentSuccess.tsx` |
| **MODIFICARE** | `src/pages/Admin.tsx` |
| **MODIFICARE** | `src/pages/Terms.tsx` |
| **MODIFICARE** | `src/types/index.ts` |
| **MIGRAZIONE SQL** | Creare tabella `stripe_connected_accounts` + aggiornare `withdrawal_requests` |

---

## Checklist Finale

- [ ] PayPal diretto rimosso completamente (edge functions + UI + config)
- [ ] Stripe Checkout con PayPal abilitato (`payment_method_types: ["card", "paypal"]`)
- [ ] Email modificabile in checkout (non passare `customer`, usare `customer_email`)
- [ ] Commissione fissa €0,50 su ogni acquisto (line item separato)
- [ ] Minimo acquisto 5 coins (validazione frontend + backend)
- [ ] Stripe Connect Express per payout utenti
- [ ] Minimo prelievo €10 + commissione €0,50
- [ ] UI Wallet con stato verifica Stripe e form prelievo
- [ ] Webhook `account.updated` per sync stato KYC
