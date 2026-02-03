
# Fix Completo: Match Bloccati in Status "FULL"

## REPORT BUG TROVATI

### Causa Root: Mismatch DB ↔ Frontend

| Componente | Problema | File |
|------------|----------|------|
| **DB: join_match_v2** | Setta `status = 'full'` invece di `'ready_check'` | `20260203175004_*.sql` linee 98-101, 227-228 |
| **FE: MatchDetails.tsx** | `showReadyUp` controlla solo `'ready_check'`, ignora `'full'` | linea 493 |
| **FE: ReadyUpSection.tsx** | Bottone Ready appare solo se `status === 'ready_check'` | linea 138 |
| **FE: MyMatches.tsx** | `activeStatuses` non include `'full'` | linea 87 |
| **FE: MyMatchCard.tsx** | `needsReadyUp` controlla solo `'ready_check'` | linea 49 |

### Stato Attuale nel DB

Match bloccati:
```
id: a02875e9-0c1a-43f0-9cf9-62a0cd8d05f5
status: 'full' (dovrebbe essere 'ready_check')
ready_check_at: 2026-02-03 18:06:24
started_at: NULL (conferma che non è mai iniziato)
```

### Cosa Funziona Già

- **set_player_ready**: Già accetta `status IN ('ready_check', 'full')` ✅
- **Transizioni in_progress**: Funziona sia da `ready_check` che da `full` ✅

---

## SOLUZIONE: STATUS MACHINE UNICA

### Status Canonici Finali

```text
open → ready_check → in_progress → result_pending → completed
         ↓                                            ↓
       (legacy: 'full' = alias)                   disputed
                                                admin_resolved
                                                   canceled
                                                   expired
```

**Regola**: `'full'` NON deve più essere usato. Il DB deve settare direttamente `'ready_check'` quando il match è pieno.

---

## FIX DA IMPLEMENTARE

### 1. DB MIGRATION: Fix join_match_v2

Creare nuova migration che sostituisce `status = 'full'` con `status = 'ready_check'`:

```sql
-- In join_match_v2, linea 98-101 (1v1):
UPDATE matches SET 
  status = 'ready_check',  -- ERA 'full'
  ready_check_at = now()
WHERE id = p_match_id;

-- In join_match_v2, linea 227-228 (team mode):
UPDATE matches SET 
  team_b_id = p_team_id,
  captain_b_user_id = v_caller_id,
  joiner_payer_user_id = v_caller_id,
  payment_mode_joiner = p_payment_mode,
  status = 'ready_check',  -- ERA 'full'
  ready_check_at = now()
WHERE id = p_match_id;
```

### 2. DB MIGRATION: Data Repair

Sbloccare match esistenti in `'full'`:

```sql
UPDATE matches
SET status = 'ready_check'
WHERE status = 'full'
  AND started_at IS NULL
  AND expires_at > now();
```

### 3. FE: MatchDetails.tsx

Aggiornare `showReadyUp` per accettare anche `'full'` come fallback temporaneo:

```typescript
// Linea 493:
// ERA:
const showReadyUp = !isAdminSpectator && match.status === 'ready_check' && isParticipant;

// DIVENTA:
const showReadyUp = !isAdminSpectator && (match.status === 'ready_check' || match.status === 'full') && isParticipant;
```

### 4. FE: ReadyUpSection.tsx

Aggiornare condizione bottone Ready:

```typescript
// Linea 138:
// ERA:
{!isReady && match.status === 'ready_check' && (

// DIVENTA:
{!isReady && (match.status === 'ready_check' || match.status === 'full') && (
```

### 5. FE: MyMatches.tsx

Aggiornare `activeStatuses` per includere `'full'`:

```typescript
// Linea 68:
const activeStatuses: MatchStatus[] = ['ready_check', 'in_progress', 'result_pending', 'disputed', 'full'];

// Linea 87:
const activeStatuses: MatchStatus[] = ['ready_check', 'in_progress', 'result_pending', 'disputed', 'full'];

// Linea 101:
if ((match.status === 'ready_check' || match.status === 'full') && !participant.ready) return true;
```

### 6. FE: MyMatchCard.tsx

Aggiornare logiche per `'full'`:

```typescript
// Linea 49:
// ERA:
const needsReadyUp = match.status === 'ready_check' && participant && !participant.ready;

// DIVENTA:
const needsReadyUp = (match.status === 'ready_check' || match.status === 'full') && participant && !participant.ready;

// Linea 59:
// ERA:
const showOpponentIdentity = match.status !== 'ready_check' || allReady;

// DIVENTA (nasconde avversario anche in 'full'):
const showOpponentIdentity = (match.status !== 'ready_check' && match.status !== 'full') || allReady;

// Linea 149 (Ready Status display):
// ERA:
{match.status === 'ready_check' && (

// DIVENTA:
{(match.status === 'ready_check' || match.status === 'full') && (
```

---

## ORDINE DI ESECUZIONE

1. **Prima**: Migration DB per `join_match_v2` (nuovi match usano `ready_check`)
2. **Seconda**: Migration DB per data repair (sblocca match esistenti)
3. **Terza**: Fix frontend (compatibilità temporanea con `'full'` legacy)

---

## CHECKLIST TEST

### Test 1: Nuovo Match 1v1
- [ ] User A crea match → status `open`
- [ ] User B joina → status diventa `ready_check` (NON `full`)
- [ ] Entrambi vedono bottone "READY UP"
- [ ] User A ready → A vede "You're Ready"
- [ ] User B ready → status diventa `in_progress`
- [ ] Match appare in "My Matches → Active"

### Test 2: Match Esistente (Legacy)
- [ ] Match esistente in `full` dopo data repair diventa `ready_check`
- [ ] Bottone READY UP appare
- [ ] Ready funziona normalmente

### Test 3: Match 2v2/3v3/4v4
- [ ] Team B joina → status `ready_check`
- [ ] Tutti i player vedono READY UP
- [ ] Quando tutti ready → `in_progress`

### Test 4: My Matches Visibility
- [ ] Match in `ready_check` appare in Active
- [ ] Match in `full` (se rimasti legacy) appare in Active
- [ ] Badge "Action Required" appare per ready up

---

## FILE DA MODIFICARE

| File | Modifica |
|------|----------|
| `supabase/migrations/[new].sql` | Fix join_match_v2: status='ready_check' |
| `supabase/migrations/[new].sql` | Data repair: full → ready_check |
| `src/pages/MatchDetails.tsx` | showReadyUp accetta 'full' |
| `src/components/matches/ReadyUpSection.tsx` | Bottone accetta 'full' |
| `src/pages/MyMatches.tsx` | activeStatuses include 'full' |
| `src/components/matches/MyMatchCard.tsx` | needsReadyUp, showOpponentIdentity, Ready Status |

---

## NOTA TECNICA

### Perché mantenere compatibilità con 'full' nel frontend?

1. **Match legacy**: Potrebbero esserci match creati prima del fix che sono in `'full'`
2. **Race condition**: Durante il deploy, il DB potrebbe ancora usare la vecchia funzione
3. **Rollback safety**: Se la migration fallisce, il frontend continua a funzionare

### Quando rimuovere il supporto 'full'?

Dopo 1-2 settimane di produzione stabile, quando:
- Non ci sono più match con `status = 'full'`
- Tutti gli utenti hanno aggiornato il frontend
