

# Piano Fix Completo: Admin Resolve + Match Disputed + Audio 100%

## REPORT BUG TROVATI

### BUG #1: Admin Resolve non funziona (CRITICO)

**Errore**: "Invalid action. Use TEAM_A_WIN, TEAM_B_WIN, or REFUND_BOTH"

**File interessato**: `src/pages/AdminMatchDetail.tsx` linee 118, 478, 486, 494

**Problema**: I pulsanti di risoluzione inviano valori sbagliati:
```typescript
// SBAGLIATO (linea 118)
const handleResolve = async (action: 'team_a_wins' | 'team_b_wins' | 'refund') => {

// Pulsanti (linee 478, 486, 494)
onClick={() => handleResolve('team_a_wins')}  // SBAGLIATO
onClick={() => handleResolve('team_b_wins')}  // SBAGLIATO
onClick={() => handleResolve('refund')}       // SBAGLIATO
```

**Contratto DB** (`admin_resolve_match_v3` linea 49):
```sql
IF p_action NOT IN ('TEAM_A_WIN', 'TEAM_B_WIN', 'REFUND_BOTH') THEN
  RETURN jsonb_build_object('success', false, 'error', 'Invalid action...');
```

**Fix**: Cambiare il frontend per inviare i valori esatti richiesti dal DB.

---

### BUG #2: Match va in DISPUTED (GIA' FIXATO NEL DB)

**Stato**: Il DB e' stato gia' aggiornato con la migration `20260203175004` che usa importi POSITIVI.

**Verifica DB**: La funzione `join_match_v2` ora ha:
```sql
INSERT INTO transactions (user_id, type, amount, description, match_id)
VALUES (v_caller_id, 'lock', v_entry_fee, 'Match entry fee', p_match_id);
-- v_entry_fee e' POSITIVO (senza segno meno)
```

**Problema legacy**: I match creati PRIMA del fix (come `b091045d-f192-4126-9040-eef4cebfe1f8`) hanno ancora transazioni negative e non possono essere finalizzati automaticamente. Devono essere risolti manualmente dall'admin.

**Nuovi match**: Funzioneranno correttamente con lock positivi.

---

### BUG #3: Audio Notifications (PARZIALMENTE FUNZIONANTE)

**Cosa funziona**:
- `GlobalMatchEventListener` e' montato globalmente in `App.tsx`
- `set_player_ready` emette eventi `ready` e `all_ready` correttamente
- `join_match_v2` emette eventi `player_joined` 
- Audio unlock e' implementato correttamente
- `useSoundNotifications.ts` NON blocca piu' l'audio per `prefersReducedMotion`

**Potenziale problema**: Realtime subscription potrebbe non essere sempre affidabile.

**Miglioramento consigliato**: Aggiungere fallback polling per garantire audio 100%.

---

## MODIFICHE RICHIESTE

### FASE 1: Fix AdminMatchDetail.tsx (CRITICO)

Modificare il frontend per allineare i valori delle action al contratto DB:

```typescript
// Linea 118: Cambiare tipo
const handleResolve = async (action: 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'REFUND_BOTH') => {

// Linea 122: Aggiornare check
if (action !== 'REFUND_BOTH' && !adminNotes.trim()) {

// Linea 478: Aggiornare onClick
onClick={() => handleResolve('TEAM_A_WIN')}

// Linea 486: Aggiornare onClick  
onClick={() => handleResolve('TEAM_B_WIN')}

// Linea 494: Aggiornare onClick
onClick={() => handleResolve('REFUND_BOTH')}
```

### FASE 2: Aggiungere Polling Fallback per Audio 100%

Aggiungere al `GlobalMatchEventListener` un polling ogni 3 secondi per garantire che gli eventi arrivino anche se il realtime fallisce:

```typescript
// Nuovo hook per fallback polling
const lastSeenRef = useRef<string | null>(null);

useEffect(() => {
  if (!userId) return;
  
  const pollEvents = async () => {
    // Query per eventi nuovi dove target_user_ids contiene userId
    const { data } = await supabase
      .from('match_events')
      .select('*')
      .contains('target_user_ids', [userId])
      .gt('created_at', lastSeenRef.current || new Date(Date.now() - 30000).toISOString())
      .order('created_at', { ascending: true })
      .limit(10);
    
    if (data && data.length > 0) {
      for (const event of data) {
        // Skip if already processed via realtime
        if (event.actor_user_id !== userId) {
          playSound('match_accepted');
          // Show toast based on event type
        }
      }
      lastSeenRef.current = data[data.length - 1].created_at;
    }
  };
  
  const interval = setInterval(pollEvents, 3000);
  return () => clearInterval(interval);
}, [userId, playSound]);
```

---

## RIEPILOGO FILE DA MODIFICARE

| File | Modifica | Priorita' |
|------|----------|-----------|
| `src/pages/AdminMatchDetail.tsx` | Fix action values per admin resolve | CRITICA |
| `src/components/common/GlobalMatchEventListener.tsx` | Aggiungere polling fallback | ALTA |

---

## DATABASE - NESSUNA MODIFICA NECESSARIA

Il database e' gia' corretto:

1. **`join_match_v2`**: Usa lock positivi (fix applicato)
2. **`set_player_ready`**: Emette eventi `ready` e `all_ready`
3. **`submit_team_declaration`**: Normalizza input uppercase, emette `result_declared`
4. **`admin_resolve_match_v3`**: Accetta solo valori corretti

---

## CHECKLIST TEST

### Test 1: Admin Resolve Match
- [ ] Aprire `/admin/matches/{id}` per un match disputed
- [ ] Cliccare "Team A Vince" → deve chiamare RPC con `'TEAM_A_WIN'`
- [ ] Cliccare "Team B Vince" → deve chiamare RPC con `'TEAM_B_WIN'`
- [ ] Cliccare "Rimborsa Entrambi" → deve chiamare RPC con `'REFUND_BOTH'`
- [ ] Nessun errore "Invalid action"

### Test 2: Match 1v1 Nuovo (Post-Fix)
- [ ] User A crea match
- [ ] User B joina → transazione lock con amount POSITIVO
- [ ] User A sente audio su join (da qualsiasi pagina)
- [ ] User B ready → User A sente audio
- [ ] User A ready → entrambi sentono audio "Match started"
- [ ] Dichiarazione WIN/LOSS → finalizzazione corretta (non disputed)

### Test 3: Match Team 2v2/3v3/4v4
- [ ] Stessi test del 1v1 ma con team completi
- [ ] Tutti i membri del team opposto ricevono audio su join
- [ ] Audio funziona anche con tab in background

### Test 4: Audio Fallback
- [ ] Simulare disconnessione realtime
- [ ] Verificare che polling fallback recuperi gli eventi
- [ ] Audio suona anche senza realtime attivo

---

## NOTE TECNICHE

### Perche' il match attuale e' disputed

Il match `b091045d-f192-4126-9040-eef4cebfe1f8` ha:
- Lock Team A: +0.50 (creatore, corretto)
- Lock Team B: -0.50 (joiner, bug pre-fix)
- Somma: 0.00 invece di 1.00

La funzione `try_finalize_match` verifica:
```sql
SELECT SUM(t.amount) FROM transactions t 
WHERE t.match_id = p_match_id AND t.type = 'lock'
```
Atteso: 0.50 * 2 = 1.00
Reale: 0.50 + (-0.50) = 0.00
Risultato: MISMATCH → disputed

**Soluzione**: Risolvere manualmente con admin (dopo il fix AdminMatchDetail).

