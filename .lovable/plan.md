

# Piano: Rimozione PayPal/IBAN e Fix Payout Stripe-Only

## Diagnosi Completa

### Problemi Identificati

| Area | Problema | File Coinvolti |
|------|----------|----------------|
| **Profile Page** | Sezione "Pagamenti" mostra ancora PayPal con input email | `src/pages/Profile.tsx:513-551` |
| **Profile Form** | Salva ancora `paypal_email` nel database | `src/pages/Profile.tsx:84,115,130` |
| **Admin Panel** | Dialog prelievo platform usa PayPal/Bonifico | `src/pages/Admin.tsx:47-48,442-448` |
| **Types** | Interface Profile ha `paypal_email` e `iban` | `src/types/index.ts:66-67` |
| **DB Schema** | Tabelle hanno colonne PayPal/IBAN legacy | `profiles.paypal_email`, `profiles.iban` |
| **Privacy/Terms** | Riferimenti testuali a PayPal | `src/pages/Privacy.tsx`, `src/pages/Terms.tsx` |

### Cosa Funziona Già

| Componente | Stato |
|------------|-------|
| `src/pages/Wallet.tsx` | ✅ UI Stripe-only (Configura Stripe / Preleva) |
| `create-stripe-connect-account` | ✅ Crea Express account + onboarding link |
| `create-stripe-payout` | ✅ Transfer a connected account |
| `stripe-webhook` | ✅ Gestisce `account.updated` per sync status |
| `stripe_connected_accounts` table | ✅ Traccia `payouts_enabled` |

---

## Modifiche da Implementare

### A) Profile Page - Rimozione PayPal UI

**File: `src/pages/Profile.tsx`**

1. **Rimuovere stato PayPal:**
```typescript
// RIMUOVERE linea 84
const [paypalEmail, setPaypalEmail] = useState('');

// RIMUOVERE da linea 115
setPaypalEmail(profile.paypal_email || '');

// RIMUOVERE da linea 130
paypal_email: paypalEmail || null,
```

2. **Sostituire sezione Pagamenti (linee 513-551):**

La nuova sezione mostrerà:
- Stato Stripe Connect (configurato/non configurato)
- Link a Wallet per gestire prelievi
- Nessun input PayPal/IBAN

```text
┌─────────────────────────────────────────────────────┐
│  ⚡ Stripe                                          │
│  Per ricevere i pagamenti delle vincite             │
│                                                     │
│  [Se non configurato]:                              │
│  ℹ️ Configura Stripe dal Wallet per prelevare       │
│  [Vai al Wallet →]                                  │
│                                                     │
│  [Se configurato]:                                  │
│  ✅ Account Stripe verificato                       │
│  [Gestisci Prelievi →]                              │
└─────────────────────────────────────────────────────┘
```

---

### B) Admin Panel - Fix Platform Withdraw

**File: `src/pages/Admin.tsx`**

1. **Rimuovere selezione PayPal/Bonifico** dal dialog prelievo platform (linee 442-448)
2. **Aggiornare stato:**
   - Rimuovere `platformPaymentMethod` 
   - Cambiare placeholder a "Note/riferimento"
3. Il prelievo platform è un'operazione manuale admin - può restare semplificato

---

### C) Types - Deprecare Campi Legacy

**File: `src/types/index.ts`**

Mantenere i campi nel type per compatibilità DB, ma aggiungere commento:
```typescript
// @deprecated - Legacy fields, non più usati per payout
paypal_email: string | null;
iban: string | null;
```

---

### D) Privacy/Terms - Aggiornare Copy

**File: `src/pages/Privacy.tsx`**

Linea 71: Cambiare da:
> "PayPal address for withdrawals"

A:
> "Stripe Connect account for withdrawals"

**File: `src/pages/Terms.tsx`**

Linea 160: Mantenere riferimento a Stripe/PayPal come fornitori terzi (appropriato per disclaimer)

---

### E) Wallet Page - Verifiche

**File: `src/pages/Wallet.tsx`**

La pagina è già configurata correttamente per Stripe-only:
- ✅ Mostra "Configura Stripe" se non verificato
- ✅ Mostra dialog prelievo solo se `payouts_enabled`
- ✅ Chiama `create-stripe-payout` correttamente

**Miglioramento:** Aggiungere fetch dello stato Stripe Connect all'avvio per garantire persistenza dopo refresh.

---

### F) Edge Functions - Già Corrette

Le edge functions sono già implementate correttamente:

| Function | Validazione |
|----------|-------------|
| `create-stripe-connect-account` | ✅ Valida `sk_live_`/`sk_test_` |
| `create-stripe-payout` | ✅ Verifica `payouts_enabled`, min €10, fee €0.50 |
| `stripe-webhook` | ✅ Sync `account.updated` → DB |

---

## Riepilogo File da Modificare

| File | Azione |
|------|--------|
| `src/pages/Profile.tsx` | Rimuovere PayPal UI e logica salvataggio |
| `src/pages/Admin.tsx` | Semplificare dialog prelievo platform |
| `src/types/index.ts` | Aggiungere commenti deprecation |
| `src/pages/Privacy.tsx` | Aggiornare menzione PayPal → Stripe |

---

## Checklist Finale

Dopo le modifiche:

| Scenario | Comportamento Atteso |
|----------|---------------------|
| Utente non connesso a Stripe | Vede "Configura Stripe" in Wallet, nessun PayPal nel Profile |
| Utente connesso ma non verificato | Vede messaggio completamento verifica |
| Utente verificato (`payouts_enabled=true`) | Può inserire importo ≥€10 e prelevare |
| Refresh pagina / navigazione | UI resta coerente, basata su stato DB |
| Profile → Pagamenti | Mostra solo stato Stripe e link a Wallet |

---

## Note Tecniche

### Perché non rimuovere le colonne DB?

Le colonne `paypal_email` e `iban` nella tabella `profiles` possono restare per:
1. Compatibilità con dati storici
2. Evitare migrazione distruttiva
3. La UI semplicemente non le mostra/usa più

Se in futuro si vuole fare pulizia:
```sql
-- Opzionale: Pulire dati legacy
UPDATE profiles SET paypal_email = NULL, iban = NULL WHERE paypal_email IS NOT NULL;
```

