
# Piano: Fix Completo UI/UX Premium + Bug Critici

## Diagnosi Problemi Rilevati

### 🔴 Problemi Critici

| Problema | Causa | File |
|----------|-------|------|
| **Compare fallisce** | `supabase.rpc as any` causa errore "Cannot read properties of undefined (reading 'rest')" | `PlayerComparisonModal.tsx` |
| **Player Search non trova nessuno** | La RPC `search_players_public` non esiste nel database - la migrazione non è stata creata | Migrazione SQL mancante |
| **Tip nascosto per non-VIP** | `if (!isVip) return Alert` blocca l'intero modal | `TipModal.tsx` linea 141-160 |
| **Leaderboard view ordina sbagliato** | La view base usa `ORDER BY wins DESC, total_earnings DESC` (invertito) | View `leaderboard` |

### 🟡 Problemi UI

| Problema | File |
|----------|------|
| Header Tip button solo per VIP | `Header.tsx` linea 79 |
| PlayerStatsModal mostra Tip solo per VIP | `PlayerStatsModal.tsx` linea 72 |

---

## 1. FIX CRITICO: Search Players RPC (Manca completamente)

La RPC `search_players_public` viene chiamata ma **non esiste nel database**. Creare la migrazione:

```sql
CREATE OR REPLACE FUNCTION public.search_players_public(
  p_query text,
  p_current_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    pp.user_id,
    pp.username,
    pp.avatar_url,
    COALESCE(
      (SELECT r.rn FROM (
        SELECT lb.user_id, ROW_NUMBER() OVER (ORDER BY lb.total_earnings DESC, lb.wins DESC) as rn
        FROM leaderboard lb
      ) r WHERE r.user_id = pp.user_id),
      999999
    ) as rank
  FROM profiles_public pp
  WHERE 
    pp.username ILIKE '%' || p_query || '%'
    AND (p_current_user_id IS NULL OR pp.user_id != p_current_user_id)
  ORDER BY 
    CASE WHEN LOWER(pp.username) = LOWER(p_query) THEN 0 ELSE 1 END,
    LENGTH(pp.username)
  LIMIT p_limit;
$$;
```

---

## 2. FIX CRITICO: Compare Modal - Errore RPC

**Problema**: Il codice usa `supabase.rpc as any` per chiamare `get_player_rank`, causando errore "rest undefined".

**File**: `src/components/player/PlayerComparisonModal.tsx`

**Soluzione**: Usare chiamata RPC standard senza cast:

```typescript
// PRIMA (broken):
const rpc = supabase.rpc as any;
const [myRankRes, targetRankRes] = await Promise.all([
  rpc('get_player_rank', { p_user_id: user.id }),
  rpc('get_player_rank', { p_user_id: targetUserId }),
]);

// DOPO (corretto):
const [myRankRes, targetRankRes] = await Promise.all([
  supabase.rpc('get_player_rank', { p_user_id: user.id }),
  supabase.rpc('get_player_rank', { p_user_id: targetUserId }),
]);
```

Inoltre aggiungere gestione errori robusta e fallback se le chiamate falliscono.

---

## 3. FIX: Tip Visibile a Tutti (Rimuovere VIP Block)

### File: `src/components/vip/TipModal.tsx`

**Problema**: Linee 141-160 bloccano completamente il modal per non-VIP.

**Soluzione**: Rimuovere il blocco VIP nella UI. La verifica VIP esiste già nel backend (`send_tip` RPC). Mostrare il modal a tutti, e se l'utente non-VIP prova a inviare, vedrà l'errore "VIP required" dal backend.

```typescript
// RIMUOVERE questo blocco:
if (!isVip) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <Alert variant="destructive">
          VIP membership required...
        </Alert>
      </DialogContent>
    </Dialog>
  );
}
```

**Alternativa UX migliore**: Mostrare sempre il modal, ma se non-VIP:
- Mostrare badge "VIP Required" sul bottone Send
- Bottone Send cliccabile ma mostra toast con upsell a VIP

### File: `src/components/layout/Header.tsx`

**Linea 79**: Cambiare `{user && isVip && (` → `{user && (`

### File: `src/components/player/PlayerStatsModal.tsx`

**Linea 72**: Cambiare `const canTip = user && user.id !== userId && isVip;` → `const canTip = user && user.id !== userId;`

---

## 4. FIX: Leaderboard View Ordering

**Problema**: La view `leaderboard` ordina per `wins DESC, total_earnings DESC`. Deve essere invertito.

**Soluzione**: Ricreare la view con l'ordine corretto:

```sql
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT 
  p.id,
  p.user_id,
  p.username,
  p.avatar_url,
  COUNT(DISTINCT CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN mr.match_id END) as wins,
  COUNT(DISTINCT mp.match_id) as total_matches,
  COALESCE(SUM(CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN m.entry_fee * 1.9 ELSE 0 END), 0) as total_earnings
FROM public.profiles p
LEFT JOIN public.match_participants mp ON mp.user_id = p.user_id
LEFT JOIN public.matches m ON m.id = mp.match_id AND m.status = 'finished'
LEFT JOIN public.match_results mr ON mr.match_id = m.id
GROUP BY p.id, p.user_id, p.username, p.avatar_url
ORDER BY total_earnings DESC, wins DESC;  -- FIX: era invertito
```

---

## 5. FIX: Player Search Bar - Debounce e Query

### File: `src/components/common/PlayerSearchBar.tsx`

**Miglioramenti**:
1. Ridurre debounce da 300ms a 200ms per reattività
2. Permettere ricerca con 1 carattere (non 2)
3. Migliorare styling dropdown con blur e shadow premium

```typescript
// Linea 34: cambiare minimo caratteri
if (query.trim().length < 1) {  // era 2
  setResults([]);
  setOpen(false);
  return;
}
```

---

## 6. Username Univoco + Discord Bug

### Migrazione SQL

```sql
-- Assicurarsi che discord_username esista già (verificato: esiste)
-- Aggiungere UNIQUE constraint su username
ALTER TABLE profiles 
ADD CONSTRAINT profiles_username_unique UNIQUE (username);

-- Funzione per generare username unico
CREATE OR REPLACE FUNCTION generate_unique_username(base_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  clean_name text;
  candidate text;
  counter int := 0;
BEGIN
  -- Pulisci il nome base
  clean_name := regexp_replace(LOWER(base_name), '[^a-z0-9_]', '', 'g');
  IF LENGTH(clean_name) < 3 THEN
    clean_name := 'player';
  END IF;
  
  candidate := clean_name;
  
  WHILE EXISTS (SELECT 1 FROM profiles WHERE LOWER(username) = LOWER(candidate)) LOOP
    counter := counter + 1;
    candidate := clean_name || counter::text;
  END LOOP;
  
  RETURN candidate;
END;
$$;
```

---

## 7. Notifiche Audio - Fix e Test Sound

### File: `src/hooks/useSoundNotifications.ts`

Il sistema esiste già ed è ben implementato. Verificare integrazione in `MatchDetails.tsx`:

```typescript
// Già presente, verificare che playSound venga chiamato correttamente
const { playSound, needsUnlock, unlockAudio } = useSoundNotifications();
```

**Miglioramento**: Aggiungere banner UI se `needsUnlock` è true:

```typescript
{needsUnlock && (
  <Button onClick={unlockAudio} variant="outline" size="sm">
    <Volume2 className="w-4 h-4 mr-2" />
    Enable Match Sounds
  </Button>
)}
```

---

## 8. UI Premium - Già Implementato

Verificato che:
- ✅ Social icons in Header e Footer con hover glow oro
- ✅ Admin chat styling con rosso e font grande
- ✅ Dropdown notifiche premium

---

## Riepilogo Modifiche

| Priorità | File | Azione |
|----------|------|--------|
| 🔴 CRITICO | Migrazione SQL | Creare RPC `search_players_public` |
| 🔴 CRITICO | Migrazione SQL | Fixare ordering view `leaderboard` |
| 🔴 CRITICO | `PlayerComparisonModal.tsx` | Rimuovere `as any` da chiamate RPC |
| 🟡 ALTO | `TipModal.tsx` | Rimuovere blocco VIP (linee 141-160) |
| 🟡 ALTO | `Header.tsx` | Mostrare Tip button a tutti (linea 79) |
| 🟡 ALTO | `PlayerStatsModal.tsx` | Mostrare Tip a tutti (linea 72) |
| 🟡 ALTO | `PlayerSearchBar.tsx` | Ridurre minimo caratteri a 1 |
| 🟢 MEDIO | Migrazione SQL | Aggiungere UNIQUE constraint su username |

---

## Test Post-Implementazione

| Test | Risultato Atteso |
|------|------------------|
| Cerca "m" nella search bar | Dropdown con utenti che contengono "m" |
| Clicca Compare su un player | Modal si apre con dati reali |
| Clicca Tip (utente non-VIP) | Modal si apre, errore solo al Send |
| Leaderboard | Ordinata per total_earnings DESC |
| Crea user con username duplicato | Username auto-generato con suffix |
