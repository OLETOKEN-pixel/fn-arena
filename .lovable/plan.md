

# Analisi Completa e Fix: Sistema Match + Audio Notifications

## Sommario Esecutivo

Ho analizzato l'intero codice da inizio a fine. Ecco il report completo:

---

## REPORT BUG TROVATI

### BUG A: Join Match - transactions_type_check (RISOLTO)

**Stato**: Il database E' GIA' CORRETTO.

**Verifica**: La funzione `join_match_v2` attualmente deployata usa `type = 'lock'` (verificato con `pg_get_functiondef`):
```sql
INSERT INTO transactions (user_id, type, amount, description, match_id)
VALUES (v_caller_id, 'lock', -v_entry_fee, 'Match entry fee', p_match_id);
```

**Constraint permessi**: `deposit`, `lock`, `unlock`, `payout`, `refund`, `fee`

**Conclusione**: Il join match FUNZIONA correttamente. Il bug precedente e' stato risolto dalla migration `20260202200946`.

---

### BUG B: Dichiarazione Risultato - win/loss vs WIN/LOSS (CRITICO - DA FIXARE)

**Stato**: BUG ATTIVO

**Problema trovato**:

| Componente | Valore Inviato | Valore Atteso |
|------------|----------------|---------------|
| Frontend `TeamResultDeclaration.tsx` (linea 129-131) | `'WIN'` / `'LOSS'` (uppercase) | - |
| DB `submit_team_declaration` (linea 17) | - | `'win'` / `'loss'` (lowercase) |

**Codice problematico in DB** (`submit_team_declaration`):
```sql
IF p_result NOT IN ('win', 'loss') THEN
  RETURN json_build_object('success', false, 'error', 'Invalid result. Must be win or loss');
END IF;
```

**Codice frontend** (`TeamResultDeclaration.tsx` linea 122, 129-131):
```typescript
const handleSubmitResult = async (result: 'WIN' | 'LOSS') => {
  // ...
  const { data, error } = await supabase.rpc('submit_team_declaration', {
    p_match_id: match.id,
    p_result: result,  // <-- INVIA 'WIN' o 'LOSS' uppercase!
  });
```

**Fix necessario**: Normalizzare l'input nella funzione DB:
```sql
v_result := UPPER(TRIM(p_result));
IF v_result NOT IN ('WIN', 'LOSS') THEN
  RETURN json_build_object('success', false, 'error', 'Invalid result. Must be WIN or LOSS');
END IF;
```

---

### BUG C: Audio Notifications (PARZIALMENTE FUNZIONANTE)

**Stato**: Sistema correttamente implementato ma con un problema locale

**Cosa funziona**:
1. Eventi `match_events` vengono creati correttamente (verificato in DB - 3 eventi recenti)
2. `GlobalMatchEventListener` e' montato in `App.tsx`
3. Audio unlock funziona in `MainLayout.tsx`
4. File audio `public/sounds/notification.mp3` esiste
5. `set_player_ready` emette eventi `ready` e `all_ready` correttamente
6. `join_match_v2` emette eventi `player_joined` al creator

**Problema identificato**: Il hook `useSoundNotifications` legge `settings.enabled` da localStorage. Se un utente ha disabilitato le notifiche in passato, l'audio non suona.

```typescript
// linea 84-85 di useSoundNotifications.ts
const playSound = useCallback((type: SoundType) => {
  if (!settings.enabled || prefersReducedMotion) return;  // <-- Check disabilita audio
```

**Fix necessario**: Forzare audio sempre ON ignorando localStorage per le notifiche match.

---

### Problemi Aggiuntivi Trovati

1. **Event type `declare` non nel constraint**: La funzione `submit_team_declaration` (versione vecchia) tenta di emettere `'declare'` ma il constraint accetta solo: `match_created`, `player_joined`, `team_ready`, `ready`, `all_ready`, `match_started`, `result_declared`.

2. **Due versioni di `submit_team_declaration`**: Esistono due versioni con logiche diverse. La versione nel DB attuale richiede lowercase.

---

## FLUSSO VERIFICATO

### Match Events (Funzionante)

```text
Verifica DB: SELECT * FROM match_events ORDER BY created_at DESC LIMIT 3;

Risultato:
- event_type: 'all_ready'   - target_user_ids: [user1, user2]
- event_type: 'ready'       - target_user_ids: [user2]  
- event_type: 'player_joined' - target_user_ids: [creator]
```

Gli eventi vengono creati correttamente con targeting appropriato.

### Constraint transactions_type_check (OK)

```text
CHECK ((type = ANY (ARRAY['deposit', 'lock', 'unlock', 'payout', 'refund', 'fee'])))
```

La funzione `join_match_v2` usa `'lock'` - OK.

---

## PIANO FIX COMPLETO

### FASE 1: Fix submit_team_declaration (DB Migration)

Creare una nuova migration che:
1. Normalizza input a uppercase
2. Valida su `'WIN'`/`'LOSS'`
3. Salva sempre uppercase per coerenza con `try_finalize_match`

```sql
CREATE OR REPLACE FUNCTION public.submit_team_declaration(
  p_match_id uuid,
  p_result text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_result text;
  v_match matches%ROWTYPE;
  v_participant match_participants%ROWTYPE;
  v_team_side text;
  v_existing_team_result text;
  v_opp_result text;
  v_finalize jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_authenticated', 'error', 'Not authenticated');
  END IF;

  -- NORMALIZZA INPUT: uppercase e trim
  v_result := UPPER(TRIM(p_result));
  
  IF v_result NOT IN ('WIN','LOSS') THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_result', 'error', 'Invalid result. Must be WIN or LOSS');
  END IF;

  -- [resto della funzione rimane identico ma usa v_result invece di p_result]
  -- ...
END;
$$;
```

### FASE 2: Forzare Audio Sempre ON (Frontend)

Modificare `useSoundNotifications.ts` per ignorare `enabled` setting:

```typescript
// In playSound, rimuovere il check !settings.enabled
const playSound = useCallback((type: SoundType) => {
  // Audio e' sempre obbligatorio per match events - ignorare settings.enabled
  if (prefersReducedMotion) return;
  
  // ...resto del codice
}, [settings.volume, prefersReducedMotion]);
```

Oppure, piu' pulito: creare una funzione `playMandatorySound` che ignora le impostazioni utente.

### FASE 3: Fix Event Type (opzionale)

La versione vecchia di `submit_team_declaration` emette `'declare'` che non e' nel constraint. Le alternative:
1. Cambiare a `'result_declared'` (gia' nel constraint)
2. Aggiungere `'declare'` al constraint

Raccomandazione: usare `'result_declared'` per coerenza.

---

## FILE DA MODIFICARE

| File | Azione | Priorita' |
|------|--------|-----------|
| `supabase/migrations/[new].sql` | Fix `submit_team_declaration`: normalizza input a uppercase | CRITICA |
| `src/hooks/useSoundNotifications.ts` | Forzare audio sempre ON per notifiche match | ALTA |

---

## VERIFICA FUNZIONALITA' ESISTENTE

| Componente | Stato | Note |
|------------|-------|------|
| `join_match_v2` | OK | Usa `'lock'`, emette `player_joined` |
| `set_player_ready` | OK | Emette `'ready'` e `'all_ready'` |
| `GlobalMatchEventListener` | OK | Montato in App.tsx, filtra per target_user_ids |
| Audio unlock | OK | In MainLayout e GlobalMatchEventListener |
| `try_finalize_match` | OK | Valida uppercase `WIN`/`LOSS` |
| `declare_result` | OK | Valida uppercase `WIN`/`LOSS` |
| `match_events` table | OK | Realtime abilitato, constraint corretto |

---

## CHECKLIST POST-FIX

1. Dopo migration:
   - Verificare con: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'submit_team_declaration'`
   - Testare dichiarazione risultato da frontend

2. Test End-to-End:
   - 1v1: Creare match, join, ready up entrambi, dichiarare risultato
   - Verificare audio suona su join (al creator)
   - Verificare audio suona su ready (all'avversario)
   - Verificare audio suona su all_ready (a entrambi)

3. Test Audio Background:
   - Aprire app in una tab
   - Cliccare una volta (unlock)
   - Mettere tab in background
   - Da altra sessione: join match
   - Verificare audio suona nella tab in background

---

## NOTE TECNICHE

### Perche' esistono due versioni di submit_team_declaration?

1. **Versione nel DB attivo** (da query `pg_get_functiondef`): Richiede lowercase `'win'`/`'loss'`
2. **Versione in migration 20260122213210**: Richiede uppercase `'WIN'`/`'LOSS'`

La versione attiva e' quella piu' vecchia. La migration recente non ha sovrascritto correttamente o c'e' stata una race condition.

### Struttura Eventi Match

```text
match_events:
- match_id (uuid)
- event_type (text) - constraint: match_created, player_joined, team_ready, ready, all_ready, match_started, result_declared
- actor_user_id (uuid)
- target_user_ids (uuid[])
- payload (jsonb)
- created_at (timestamptz)
```

Gli eventi sono correttamente targetizzati e il realtime e' abilitato sulla tabella.

