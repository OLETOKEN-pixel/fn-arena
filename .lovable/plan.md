
# Piano: Fix Configurazione STRIPE_SECRET_KEY Errata

## Diagnosi

I test confermano che **la chiave attualmente configurata come `STRIPE_SECRET_KEY` NON è una chiave Stripe valida**:

```
Invalid API Key provided: mk_1Sqcj***************KAHg
```

| Prefisso | Tipo | Validità |
|----------|------|----------|
| `mk_` | **NON È UNA CHIAVE API** | ❌ Potrebbe essere un Meter Key o altro ID Stripe |
| `sk_live_` | Secret Key Live | ✓ Corretta per produzione |
| `sk_test_` | Secret Key Test | ✓ Corretta per test |
| `rk_` | Restricted Key | ⚠️ Permessi limitati |
| `pk_` | Publishable Key | ❌ Solo frontend |

**Problema**: Quando hai aggiornato il secret, è stato inserito un valore errato (probabilmente un Meter Key o altro ID Stripe, non la Secret Key).

---

## Soluzione Immediata

### Passo 1: Ottenere la Chiave Corretta dalla Dashboard Stripe

1. Vai su [Stripe Dashboard → Developers → API Keys](https://dashboard.stripe.com/apikeys)
2. Copia la **Secret key** (NON il Meter Key o altri ID)

   **LIVE Mode**:
   ```
   sk_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```
   
   **TEST Mode** (per testing):
   ```
   sk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

   ![Stripe API Keys](https://docs.stripe.com/img/dashboard/api-keys.png)

### Passo 2: Aggiornare il Secret

Usa lo strumento per aggiornare `STRIPE_SECRET_KEY` con la chiave corretta.

### Passo 3: Verificare STRIPE_WEBHOOK_SECRET

Il `STRIPE_WEBHOOK_SECRET` deve corrispondere all'ambiente:
- Se usi `sk_live_...` → usa il webhook secret **LIVE** (`whsec_...` dalla dashboard LIVE)
- Se usi `sk_test_...` → usa il webhook secret **TEST** (`whsec_...` dalla dashboard TEST)

Per ottenere il webhook secret:
1. Stripe Dashboard → Developers → Webhooks
2. Clicca sul tuo endpoint
3. Copia "Signing secret" (`whsec_...`)

---

## Cosa è Già Corretto nel Codice

| Componente | Stato | Note |
|------------|-------|------|
| `create-checkout/index.ts` | ✓ | Usa `price_data` (no price_id hardcodati) |
| `create-stripe-connect-account/index.ts` | ✓ | Validazione chiave + gestione errori |
| `create-stripe-payout/index.ts` | ✓ | Validazione chiave + gestione errori |
| `stripe-webhook/index.ts` | ✓ | Gestisce eventi correttamente |
| Frontend (BuyCoins) | ✓ | Non usa publishable key (redirect a Checkout) |

**Il codice è pronto per LIVE** - serve solo configurare le chiavi corrette.

---

## Checklist Configurazione Live

| Secret | Valore Richiesto | Come Verificare |
|--------|------------------|-----------------|
| `STRIPE_SECRET_KEY` | `sk_live_XXXXX...` | Dashboard → API Keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_XXXXX...` (LIVE) | Dashboard → Webhooks → Endpoint → Signing secret |

---

## Dopo l'Aggiornamento

Una volta configurate le chiavi corrette:

1. **Test Acquisto Coins**: 
   - Vai su `/buy`
   - Seleziona 5 coins
   - Clicca "Paga ora"
   - Deve aprirsi Stripe Checkout in modalità LIVE
   - Metodi pagamento: Carta + PayPal (se configurato in Stripe)

2. **Test Payout (Stripe Connect)**:
   - Vai su `/wallet`
   - Clicca "Configura Stripe"
   - Deve aprirsi l'onboarding Stripe Express
   - Dopo completamento, pulsante "Preleva" attivo

---

## Azione Richiesta

Devo aggiornare il secret `STRIPE_SECRET_KEY` con la chiave corretta dal tuo account Stripe.

**IMPORTANTE**: Assicurati di copiare la **Secret key** (inizia con `sk_live_` o `sk_test_`), NON:
- Meter Key (`mk_...`)
- Publishable Key (`pk_...`)
- Restricted Key (`rk_...`)
- Product/Price ID (`prod_...`, `price_...`)
