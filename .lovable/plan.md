

# Fix Completo: Match DISPUTED + Audio Notifications

## REPORT BUG TROVATI

### BUG 1: Match va in DISPUTED anche con WIN/LOSS corretti (CRITICO)

**Causa Root**: Mismatch tra segno degli importi nelle transazioni lock.

| Funzione | Valore Amount | Stato |
|----------|---------------|-------|
| `create_match_1v1` | `+entry_fee` (positivo) | Corretto |
| `join_match_v2` | `-entry_fee` (negativo) | **ERRATO** |

**Prova dal DB**:
```
Match: b091045d-f192-4126-9040-eef4cebfe1f8 (status: disputed)
Risultati: Team A = WIN, Team B = LOSS (corretti, complementari)

Transazioni lock:
- Creator (ea30bfbf): amount = +0.50
- Joiner (6adc41b1): amount = -0.50
```

**Cosa succede in try_finalize_match**:
```sql
SUM(t.amount) FROM transactions WHERE type='lock' AND match_id=...
```
- Atteso per 1v1: `entry_fee * 2` = 1.00
- Reale: `0.50 + (-0.50)` = 0.00
- Risultato: MISMATCH → disputed!

**File interessato**: `supabase/migrations/20260202200946_f899e5db-553a-4428-bfec-0978b521e79f.sql`

**Linee da correggere in join_match_v2**:
- Linea 108 (1v1): `VALUES (v_caller_id, 'lock', -v_entry_fee, ...)` → usare `v_entry_fee` (positivo)
- Linea 215 (team cover): `VALUES (v_caller_id, 'lock', -v_total_cost, ...)` → usare `v_total_cost` (positivo)
- Linea 228 (team split): `VALUES (v_member_id, 'lock', -v_entry_fee, ...)` → usare `v_entry_fee` (positivo)

---

### BUG 2: Audio non suona (blocco prefers-reduced-motion)

**Causa**: Il hook `useSoundNotifications.ts` blocca l'audio se il sistema operativo ha "Riduci movimento" attivo.

```typescript
// Linea 30-32
const prefersReducedMotion = typeof window !== 'undefined' 
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
  : false;

// Linea 86
if (prefersReducedMotion) return; // ← BLOCCA TUTTO L'AUDIO
```

**Problema**: "Riduci movimento" dovrebbe bloccare solo le animazioni CSS, NON l'audio. Molti utenti hanno questa preferenza attiva senza saperlo.

**Fix**: Rimuovere il check `prefersReducedMotion` dalla funzione `playSound`.

---

### VERIFICHE POSITIVE (Funzionano correttamente)

| Componente | Stato | Note |
|------------|-------|------|
| Eventi `match_events` | ✅ OK | Vengono creati correttamente |
| `set_player_ready` | ✅ OK | Emette `ready` e `all_ready` |
| `player_joined` eventi | ✅ OK | Targetta creator correttamente |
| `GlobalMatchEventListener` | ✅ OK | Montato in App.tsx |
| `submit_team_declaration` | ✅ OK | Accetta WIN/LOSS uppercase |
| Realtime subscription | ✅ OK | Vedo eventi nel DB |

---

## PIANO FIX

### FASE 1: Fix join_match_v2 (Importi POSITIVI)

Creare nuova migration che aggiorna `join_match_v2` per usare importi positivi:

```sql
-- 1v1 join (linea 108)
INSERT INTO transactions (user_id, type, amount, description, match_id)
VALUES (v_caller_id, 'lock', v_entry_fee, 'Match entry fee', p_match_id);
--                         ^^^^^^^^^^^^ POSITIVO (non -v_entry_fee)

-- Team cover (linea 215)
INSERT INTO transactions (user_id, type, amount, description, match_id)
VALUES (v_caller_id, 'lock', v_total_cost, 'Team match entry (cover mode)', p_match_id);
--                         ^^^^^^^^^^^^ POSITIVO (non -v_total_cost)

-- Team split (linea 228)
INSERT INTO transactions (user_id, type, amount, description, match_id)
VALUES (v_member_id, 'lock', v_entry_fee, 'Team match entry (split mode)', p_match_id);
--                         ^^^^^^^^^^^^ POSITIVO (non -v_entry_fee)
```

### FASE 2: Fix Audio Hook (Rimuovere blocco reduced-motion)

Modificare `src/hooks/useSoundNotifications.ts`:

```typescript
// RIMUOVERE questa riga nel playSound:
if (prefersReducedMotion) return;

// MANTENERE prefersReducedMotion solo per animazioni UI, NON per audio
```

### FASE 3: Migliorare targeting eventi (team opposto)

Attualmente `player_joined` viene emesso solo al `creator_id`. Per team matches, dovrebbe essere emesso a TUTTI i membri del team opposto.

Fix in `join_match_v2`:
```sql
-- Invece di:
PERFORM emit_match_event(..., ARRAY[v_match.creator_id], ...);

-- Usare:
SELECT array_agg(user_id) INTO v_opponent_ids
FROM match_participants
WHERE match_id = p_match_id AND team_side != v_team_side;

PERFORM emit_match_event(..., v_opponent_ids, ...);
```

---

## FILE DA MODIFICARE

| File | Azione | Priorita |
|------|--------|----------|
| `supabase/migrations/[new].sql` | Fix join_match_v2: amount positivo + targeting team opposto | CRITICA |
| `src/hooks/useSoundNotifications.ts` | Rimuovere blocco prefersReducedMotion | ALTA |

---

## FLUSSO DOPO IL FIX

```text
1. User A crea match (create_match_1v1)
   → transactions: lock +0.50 ✓
   
2. User B joina match (join_match_v2 FIXED)
   → transactions: lock +0.50 ✓ (non più -0.50)
   → emit player_joined a User A
   → User A sente audio (se reduced-motion fix applicato)

3. Ready up
   → eventi ready/all_ready correttamente targetizzati
   → audio suona a tutti i partecipanti

4. Dichiarazione risultato (WIN/LOSS)
   → try_finalize_match
   → SUM(locks) = 0.50 + 0.50 = 1.00 ✓
   → expected = 0.50 * 2 = 1.00 ✓
   → MATCH! → payout → completed (non più disputed)
```

---

## TECHNICAL DETAILS

### Perche try_finalize_match si aspetta importi positivi?

La logica per team matches verifica:
```sql
SUM(t.amount) FROM transactions 
WHERE type='lock' AND status='completed' AND user_id = payer_id
```

E confronta con `entry_fee * team_size`.

Se `entry_fee = 0.50` e `team_size = 1`:
- Expected: `0.50 * 1 = 0.50` per ogni team
- Totale atteso: `0.50 + 0.50 = 1.00`

Con lock negativi:
- Reale: `0.50 + (-0.50) = 0.00`
- MISMATCH → disputed

### Perche reduced-motion blocca l'audio?

Il codice originale usava `prefersReducedMotion` come "safety check" generale, ma questo e' semanticamente sbagliato. La preferenza "Riduci movimento" e' specifica per animazioni CSS/JavaScript che possono causare motion sickness, NON per notifiche audio.

---

## CHECKLIST POST-FIX

1. Deploy migration
2. Verificare con query:
   ```sql
   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'join_match_v2';
   -- Cercare: amount = v_entry_fee (positivo)
   ```

3. Test end-to-end:
   - [ ] 1v1: Create → Join → Ready → Result → Completed (non disputed)
   - [ ] Audio suona su player_joined
   - [ ] Audio suona su ready/all_ready
   - [ ] Audio funziona anche con reduced-motion attivo
   - [ ] 2v2/3v3/4v4: stessi test

