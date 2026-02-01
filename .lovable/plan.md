
# Fix Match Join Error + Audio Notifications

## Problema Rilevato

L'errore mostrato nello screenshot:

```
Impossibile joinare
function public.join_match_v2(uuid) is not unique
```

### Causa Root

Nel database esistono **DUE versioni** della funzione `join_match_v2`:

| Firma | Stato |
|-------|-------|
| `join_match_v2(p_match_id uuid)` | Vecchia versione (1 arg) |
| `join_match_v2(p_match_id uuid, p_team_id uuid DEFAULT NULL, p_payment_mode text DEFAULT 'cover')` | Nuova versione (3 args con default) |

Quando il wrapper `join_match()` chiama `join_match_v2(p_match_id)`, PostgreSQL trova **entrambe** le funzioni come corrispondenze valide e fallisce con "not unique".

### Differenze tra le versioni

**Vecchia versione** (da eliminare):
- Non controlla expiry del match
- Non emette eventi `emit_match_event`
- Usa transaction type `'lock'` (obsoleto)
- Non supporta team matches

**Nuova versione** (da mantenere):
- Controlla expiry match
- Emette `player_joined` event per audio notifications
- Gestisce sia 1v1 che team matches
- Ha controlli strict busy check

---

## Piano di Fix

### 1. Database Migration: Eliminare la funzione duplicata

Creare una nuova migrazione SQL che:

```sql
-- Drop the old 1-argument version of join_match_v2
-- This resolves the "function not unique" error
DROP FUNCTION IF EXISTS public.join_match_v2(uuid);
```

Questo lascerà solo la versione a 3 argomenti con DEFAULT, che accetterà correttamente le chiamate con 1 solo argomento.

---

### 2. Verifica Sistema Audio (Già Implementato ✅)

Ho verificato che il sistema audio è correttamente implementato:

**File audio**: `public/sounds/notification.mp3` ✅

**Hook `useSoundNotifications.ts`**:
- Volume 100% di default ✅
- Precarica MP3 su unlock ✅
- Funziona in background tabs dopo unlock ✅

**Global Audio Unlock in `MainLayout.tsx`**:
- Listener su click/keydown/touchstart ✅
- Chiama `unlockAudio()` alla prima interazione ✅

**Subscription Realtime in `MatchDetails.tsx`**:
- Ascolta INSERT su `match_events` table ✅
- Filtra per `target_user_ids` ✅
- Chiama `playSound()` per eventi match ✅

---

### 3. Funzioni Database Verificate ✅

**`emit_match_event`**: Esistono entrambe le versioni necessarie
- 4 args: calcola targets automaticamente
- 5 args: accetta targets espliciti

**`set_player_ready`**: Emette correttamente:
- `'ready'` event ai partecipanti
- `'all_ready'` quando tutti pronti

**`join_match_v2`** (nuova versione): Emette:
- `'player_joined'` al creator quando qualcuno joina

---

## Migrazione SQL da Eseguire

```sql
-- =====================================================
-- Fix join_match_v2 ambiguity: Drop old 1-arg version
-- =====================================================
-- The old join_match_v2(uuid) conflicts with the new
-- join_match_v2(uuid, uuid DEFAULT NULL, text DEFAULT 'cover')
-- because both match a call with just 1 uuid argument.
--
-- Solution: Drop the old version, keep only the new one.

DROP FUNCTION IF EXISTS public.join_match_v2(uuid);

-- The new version already handles:
-- - 1v1 matches (when p_team_id is NULL and team_size = 1)
-- - Team matches (when p_team_id is provided)
-- - Expiration checks
-- - Event emission for audio notifications
```

---

## Flusso Dopo il Fix

```text
                    Flusso Chiamate
                    ================

User clicks "Join Match"
         ↓
Frontend: supabase.rpc('join_match', { p_match_id })
         ↓
DB: join_match(uuid, uuid DEFAULT NULL, text DEFAULT 'cover')
         ↓
   ┌─────────────────────┐
   │ team_size = 1 (1v1) │
   └──────────┬──────────┘
              ↓
   join_match_v2(p_match_id)  ← ORA FUNZIONA!
              ↓
   (solo la versione 3-args rimane)
              ↓
   Emit player_joined event → match_events table
              ↓
   Realtime broadcast → All participants
              ↓
   MatchDetails subscription riceve INSERT
              ↓
   playSound('match_accepted')
              ↓
   Audio notification suona!
```

---

## Test Post-Fix

| Test | Risultato Atteso |
|------|------------------|
| Click "Join Match" su match 1v1 | Match joined correttamente, no errori |
| Creatore del match | Sente notifica audio quando qualcuno joina |
| Ready Up in match | Tutti i partecipanti sentono audio |
| Tab in background | Audio funziona dopo primo unlock |

---

## File da Modificare

| File | Azione |
|------|--------|
| `supabase/migrations/[new].sql` | DROP vecchia funzione join_match_v2(uuid) |

Questo è l'unico cambiamento necessario per risolvere il bug.
