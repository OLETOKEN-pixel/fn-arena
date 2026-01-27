

# Piano: Fix Stripe Connect Payout e Pulizia PayPal Residua

## Diagnosi Completa

### Problema Principale Identificato

Ho testato direttamente la edge function `create-stripe-connect-account` e il risultato è chiaro:

```json
{
  "error": "Configurazione Stripe non valida. Contatta il supporto.",
  "code": "INVALID_KEY_TYPE"
}
```

**Causa**: La `STRIPE_SECRET_KEY` salvata nei secrets **NON** è una chiave valida. Deve iniziare con `sk_live_` (produzione) o `sk_test_` (test), ma attualmente contiene un valore diverso.

### Stato Attuale del Sistema

| Componente | Stato |
|------------|-------|
| Edge Functions (codice) | ✅ Corrette - validano correttamente la chiave |
| Wallet.tsx UI | ✅ Corretta - solo Stripe Connect |
| Profile.tsx payments | ✅ Corretta - rimanda al Wallet |
| `STRIPE_SECRET_KEY` secret | ❌ **Chiave invalida** |
| BuyCoins.tsx | ⚠️ Menzione "Carta o PayPal" (minore) |
| Privacy.tsx | ⚠️ Riferimenti PayPal da aggiornare |

---

## Modifiche da Implementare

### 1. CRITICO: Aggiornare `STRIPE_SECRET_KEY`

La chiave segreta Stripe **DEVE** essere:
- **Produzione**: `sk_live_...` (circa 100+ caratteri)
- **Test**: `sk_test_...` (circa 100+ caratteri)

**Come ottenere la chiave corretta:**

1. Vai su [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys)
2. Nella sezione **Standard keys**, copia la **Secret key** (non la Publishable key!)
3. Assicurati di essere in modalità **Live** (non Test) se vuoi pagamenti reali
4. La chiave inizia con `sk_live_` o `sk_test_`

---

### 2. Edge Functions - Migliorare Error Handling

Le edge functions sono già corrette ma possiamo migliorare i messaggi di errore per il frontend:

**File: `supabase/functions/create-stripe-connect-account/index.ts`**

Miglioramenti:
- Restituire `stripeRequestId` nell'errore per debug
- Aggiungere gestione esplicita per errori Stripe Connect specifici

**File: `supabase/functions/create-stripe-payout/index.ts`**

Miglioramenti:
- Restituire dettagli errore più specifici
- Gestire caso "Your destination account needs to have at least one of the following capabilities enabled: transfers, legacy_payments"

---

### 3. Wallet.tsx - Migliorare Gestione Errori

**File: `src/pages/Wallet.tsx`**

Modifiche alla funzione `handleConnectStripe`:
- Estrarre e mostrare l'errore reale dalla risposta
- Mostrare `stripeRequestId` se disponibile per supporto

```typescript
// Migliorare estrazione errore
let errorMessage = 'Impossibile avviare la verifica Stripe.';
let requestId = null;

if (error && typeof error === 'object') {
  const errContext = error as { context?: { body?: { error?: string; details?: string; stripeRequestId?: string } } };
  const body = errContext.context?.body;
  errorMessage = body?.error || body?.details || errorMessage;
  requestId = body?.stripeRequestId;
}

toast({
  title: 'Errore Stripe',
  description: requestId 
    ? `${errorMessage} (ID: ${requestId})` 
    : errorMessage,
  variant: 'destructive',
});
```

---

### 4. Pulizia Copy PayPal Residui

**File: `src/pages/BuyCoins.tsx`** (linea 225)

Da:
```tsx
<span>Pagamento sicuro tramite Stripe • Carta o PayPal</span>
```

A:
```tsx
<span>Pagamento sicuro tramite Stripe</span>
```

**File: `src/pages/Privacy.tsx`**

Aggiornare le menzioni di PayPal:
- Linea 92: Rimuovere riferimento PayPal per withdrawal status
- Linea 119: Cambiare "Stripe (deposits) and PayPal (withdrawals)" → "Stripe for all payments and withdrawals"

---

## Riepilogo Interventi

| Priorità | File | Azione |
|----------|------|--------|
| 🔴 **CRITICA** | Secret `STRIPE_SECRET_KEY` | Aggiornare con chiave `sk_live_...` valida |
| 🟡 Miglioramento | `create-stripe-connect-account` | Restituire stripeRequestId |
| 🟡 Miglioramento | `create-stripe-payout` | Gestire errori Connect specifici |
| 🟡 Miglioramento | `src/pages/Wallet.tsx` | Mostrare errori più dettagliati |
| 🟢 Copy | `src/pages/BuyCoins.tsx` | Rimuovere menzione PayPal |
| 🟢 Copy | `src/pages/Privacy.tsx` | Aggiornare riferimenti PayPal |

---

## Flusso Corretto Dopo il Fix

```text
1. Utente clicca "Configura Stripe"
   ↓
2. Edge Function crea Express account (stripe.accounts.create)
   ↓
3. Genera link onboarding (stripe.accountLinks.create)
   ↓
4. Utente viene reindirizzato a Stripe per KYC
   ↓
5. Stripe invia webhook account.updated
   ↓
6. DB aggiorna payouts_enabled = true
   ↓
7. Utente può prelevare (min €10, fee €0.50)
   ↓
8. Edge Function crea Transfer verso connected account
```

---

## Checklist Post-Fix

| Test | Comportamento Atteso |
|------|---------------------|
| Clicca "Configura Stripe" | Redirect a Stripe onboarding (non errore 503) |
| Completa onboarding | Toast "Verifica completata", payouts_enabled = true |
| Preleva €10+ | Transfer creato, saldo scalato, toast successo |
| Errore Stripe | Mostra messaggio specifico + requestId |
| Refresh pagina | Stato Stripe persistente da DB |

---

## Azione Immediata Richiesta

**Prima di implementare le modifiche al codice, devi aggiornare la chiave Stripe:**

1. Accedi a [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Copia la **Secret key** (inizia con `sk_live_` o `sk_test_`)
3. Aggiorna il secret `STRIPE_SECRET_KEY` nel progetto

Una volta aggiornata la chiave, il payout dovrebbe funzionare immediatamente perché il codice delle edge functions è già corretto.

