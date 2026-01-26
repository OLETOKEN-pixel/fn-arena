
# Piano: Fix Errore 403 Stripe Connect - Chiave API Sbagliata

## Diagnosi

Dall'analisi dei log, l'errore è chiaro:

```
The provided key 'rk_live_*****...' does not have the required permissions
```

Il backend sta usando una **restricted key** (`rk_live_...`) invece della **secret key completa** (`sk_live_...`).

| Tipo Chiave | Prefisso | Permessi Connect | Uso Corretto |
|-------------|----------|------------------|--------------|
| Publishable | `pk_` | Nessuno | Solo frontend |
| Secret | `sk_live_` / `sk_test_` | Tutti | Backend - operazioni complete |
| Restricted | `rk_live_` / `rk_test_` | Limitati | Backend - scope specifici |

Le restricted keys (`rk_`) non hanno i permessi per Stripe Connect (`accounts.create`, `accountLinks.create`, `transfers.create`) a meno che non siano stati esplicitamente aggiunti durante la creazione della chiave.

---

## Soluzione

### FASE 1: Aggiornare la Secret Key (Azione Manuale)

**Devi aggiornare il secret `STRIPE_SECRET_KEY` con la chiave completa:**

1. Vai sulla [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Copia la **Secret key** (inizia con `sk_live_...` o `sk_test_...`)
3. Aggiorna il secret nel progetto tramite Lovable Cloud

**NON usare**:
- Chiavi che iniziano con `rk_` (restricted)
- Chiavi che iniziano con `pk_` (publishable)

---

### FASE 2: Validazione Chiave nel Backend

Aggiungere controlli nelle edge functions per rilevare subito chiavi errate e loggare informazioni utili per debug:

**Modifiche a `create-stripe-connect-account/index.ts`:**

```typescript
// Validazione chiave prima di usarla
const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

if (!stripeKey) {
  logStep("CRITICAL: STRIPE_SECRET_KEY not configured");
  return new Response(
    JSON.stringify({ error: "Sistema pagamenti non configurato" }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Verifica che sia una secret key valida (sk_live_ o sk_test_)
const keyPrefix = stripeKey.substring(0, 8);
logStep("Key prefix check", { prefix: keyPrefix });

if (!stripeKey.startsWith("sk_live_") && !stripeKey.startsWith("sk_test_")) {
  logStep("CRITICAL: Invalid key type", { 
    prefix: keyPrefix,
    expected: "sk_live_ or sk_test_",
    isRestricted: stripeKey.startsWith("rk_"),
    isPublishable: stripeKey.startsWith("pk_")
  });
  
  return new Response(
    JSON.stringify({ 
      error: "Configurazione Stripe non valida. Contatta il supporto.",
      code: "INVALID_KEY_TYPE"
    }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

---

### FASE 3: Migliorare Error Handling e UI

**Modifiche a `create-stripe-connect-account/index.ts` - catch block:**

```typescript
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const stripeError = error as { type?: string; code?: string; requestId?: string };
  
  logStep("ERROR", { 
    message: errorMessage,
    type: stripeError.type,
    code: stripeError.code,
    requestId: stripeError.requestId
  });
  
  // Messaggio user-friendly basato sul tipo di errore
  let userMessage = "Impossibile avviare la verifica. Riprova più tardi.";
  
  if (errorMessage.includes("does not have the required permissions")) {
    userMessage = "Configurazione Stripe incompleta. Contatta il supporto.";
  } else if (errorMessage.includes("Invalid API Key")) {
    userMessage = "Chiave API Stripe non valida. Contatta il supporto.";
  }
  
  return new Response(
    JSON.stringify({ error: userMessage, details: errorMessage }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Modifiche a `src/pages/Wallet.tsx` - error handling:**

```typescript
} catch (error) {
  console.error('Stripe connect error:', error);
  
  const errorData = error as { message?: string; details?: string };
  const errorMessage = errorData.message || 'Impossibile avviare la verifica Stripe.';
  
  toast({
    title: 'Errore Stripe',
    description: errorMessage,
    variant: 'destructive',
  });
}
```

---

### FASE 4: Applicare le stesse modifiche a tutte le edge functions

Le stesse validazioni vanno applicate a:

| File | Operazioni Connect |
|------|-------------------|
| `create-stripe-connect-account/index.ts` | `accounts.create`, `accountLinks.create` |
| `create-stripe-payout/index.ts` | `transfers.create` |
| `create-checkout/index.ts` | `checkout.sessions.create` (funziona anche con rk_, ma meglio unificare) |
| `stripe-webhook/index.ts` | Lettura eventi (funziona con rk_) |

---

## File da Modificare

| File | Modifica |
|------|----------|
| `supabase/functions/create-stripe-connect-account/index.ts` | Aggiungere validazione chiave + logging migliorato |
| `supabase/functions/create-stripe-payout/index.ts` | Aggiungere validazione chiave + logging migliorato |
| `src/pages/Wallet.tsx` | Migliorare gestione errori e messaggi UI |

---

## Azione Richiesta da Te

**IMPORTANTE**: Prima di implementare il codice, devi aggiornare il secret `STRIPE_SECRET_KEY`:

1. Ottieni la **Secret key** dalla [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
   - Deve iniziare con `sk_live_` (produzione) o `sk_test_` (test)
   - **NON** usare restricted keys (`rk_...`)
   
2. Aggiorna il secret nel progetto

Una volta aggiornata la chiave, il codice funzionerà correttamente.

---

## Verifica Finale

Dopo l'implementazione:

- [ ] Click su "Configura Stripe" → parte onboarding senza errori
- [ ] Nessun 403 su `/v1/accounts` nei log Stripe
- [ ] Log mostrano `prefix: sk_live_` o `sk_test_`
- [ ] Dopo onboarding, utente può richiedere payout
