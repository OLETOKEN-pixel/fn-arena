
# Piano Completo: UI/UX Premium + Fix Classifica

## Panoramica delle Funzionalità

Questo piano implementa 8 funzionalità richieste mantenendo lo stile dark/premium esistente con micro-animazioni e UX coerente.

---

## 1. Barra di Ricerca Utenti (Search Players)

### Posizione e Design
- Posizionata nella **Header** (lato sinistro), accanto al menu hamburger mobile
- Stile: Input con icona lente, sfondo `bg-secondary`, bordo sottile
- Placeholder: "Search players..."

### Componente: `src/components/common/PlayerSearchBar.tsx`
```text
┌────────────────────────────────────────┐
│ 🔍 Search players...                   │
├────────────────────────────────────────┤
│ [Avatar] username123     Rank #42      │ ← click naviga al profilo
│ [Avatar] player_xyz      Rank #156     │
│ [Avatar] gamer_pro       Rank #23      │
└────────────────────────────────────────┘
```

### Logica
- **Debounce**: 300ms
- **Query**: Nuova RPC `search_players_public(p_query, p_current_user_id, p_limit)` che:
  - Cerca in `profiles_public.username` (ILIKE)
  - Esclude l'utente corrente (`user_id != p_current_user_id`)
  - Ritorna: `user_id, username, avatar_url, rank` (calcolato da posizione leaderboard)
  - Limit: 10 risultati
- **Click risultato**: Apre `PlayerStatsModal` con userId

### File da modificare/creare
| File | Azione |
|------|--------|
| `src/components/common/PlayerSearchBar.tsx` | Nuovo componente |
| `src/components/layout/Header.tsx` | Aggiungere PlayerSearchBar |
| Migrazione SQL | Nuova RPC `search_players_public` |

---

## 2. Funzione "Compare" (Confronto Statistiche)

### UI
- **Bottone "Compare"** nel `PlayerStatsModal` accanto al bottone Tip
- Click apre `PlayerComparisonModal`

### Design Modale (da screenshot)
```text
┌─────────────────────────────────────────────────────┐
│ 📊 Player Comparison                            [X] │
├─────────────────────────────────────────────────────┤
│    [Avatar]              [Avatar]                   │
│    marvfn17              marvderg                   │
│    Rank #6131            Rank #4468                 │
├─────────────────────────────────────────────────────┤
│ Metric        You        Target      Difference    │
│ ─────────────────────────────────────────────────── │
│ Win Rate      75.0%      50.0%       +25.0%  🟢    │
│ Total Profit  +5.90      -7.50       +13.40  🟢    │
│ Total Wins    9          23          -14     🔴    │
│ Best Streak   0          4           -4      🔴    │
│ Current Streak 0         0           +0      ⚪    │
│ Total Matches 12         46          -34     🔴    │
│ Global Rank   #6131      #4468       -1663   🔴    │
└─────────────────────────────────────────────────────┘
```

### Logica
- Recupera stats di entrambi gli utenti via `get_player_stats` RPC
- Calcola differenze (verde positivo, rosso negativo, grigio neutro)
- Global Rank: calcolato dalla posizione nella leaderboard

### File da creare/modificare
| File | Azione |
|------|--------|
| `src/components/player/PlayerComparisonModal.tsx` | Nuovo componente |
| `src/components/player/PlayerStatsModal.tsx` | Aggiungere bottone Compare |

---

## 3. Icone Social (TikTok + X) in Header e Footer

### Header
- Posizione: A destra, prima del bottone notifiche
- Icone: TikTok e X (SVG custom già presente per X)
- Hover: `hover:text-accent hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]`
- Tooltip: "TikTok", "X"

### Footer
- Aggiornare i link esistenti:
  - X: `https://x.com/oleboytokens`
  - TikTok: `https://www.tiktok.com/@oleboytokens`

### File da modificare
| File | Azione |
|------|--------|
| `src/components/layout/Header.tsx` | Aggiungere icone TikTok/X |
| `src/components/layout/Footer.tsx` | Aggiornare link social |

---

## 4. Notifiche Dropdown (invece di pagina)

### Design (da screenshot)
```text
┌─────────────────────────────────────────┐
│ Notifications                    🗑️ ⚙️  │
├─────────────────────────────────────────┤
│ 🏆 2v2 Realistics Tournament      ↗     │
│    Grab your duo and join...           │
│    9 days ago                          │
├─────────────────────────────────────────┤
│ ⚙️ Maintenance Complete!               │
│    Thank you for remaining patient...  │
│    12 days ago                         │
├─────────────────────────────────────────┤
│ ⚠️ Platform Downtime                   │
│    The platform will shortly...        │
│    13 days ago                         │
└─────────────────────────────────────────┘
```

### Componente: `src/components/notifications/NotificationsDropdown.tsx`
- Trigger: Click su Bell icon in Header
- Contenuto: ScrollArea con max-height 400px
- Header: "Notifications" + icone (trash all, settings)
- Footer: "Mark all as read"
- Chiusura: Click fuori o ESC
- Badge contatore già esistente

### Logica
- Riutilizza hook `useNotifications`
- Mantiene la pagina `/notifications` per accesso completo
- Team invite actions inline nel dropdown

### File da creare/modificare
| File | Azione |
|------|--------|
| `src/components/notifications/NotificationsDropdown.tsx` | Nuovo componente |
| `src/components/layout/Header.tsx` | Sostituire Link con Dropdown |

---

## 5. Bottone "Tip" Visibile al Centro

### Posizione
- Header, zona centrale (tra logo/search e wallet/notifiche)
- Solo per utenti VIP loggati

### Design
```text
┌──────────────────────────────────────────────────────────────────┐
│ [Menu] [🔍 Search]     [💰 Send Tip]     [Wallet] [🔔] [Avatar] │
└──────────────────────────────────────────────────────────────────┘
```

### Stile Bottone
- Gradient oro: `bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400`
- Testo nero bold
- Shimmer effect on hover
- Icona Gift + "Tip"

### Modale Tip Modificata
- Aggiungere **selezione utente** se aperta senza destinatario
- Ricerca utenti VIP con dropdown
- Se non ci sono VIP: messaggio "Nessun utente VIP disponibile"

### File da modificare
| File | Azione |
|------|--------|
| `src/components/layout/Header.tsx` | Aggiungere bottone Tip centrale |
| `src/components/vip/TipModal.tsx` | Aggiungere selezione utente |

---

## 6. Chat Match: Nome Admin Rosso e Grande

### Requisiti
- Se `display_name === 'ADMIN'`:
  - Colore: rosso (`text-red-500`)
  - Font: bold, display (`font-display font-black`)
  - Dimensione: significativamente più grande (~2-3x, non 10x per evitare overflow)
  - Background messaggio: sfumatura rossa leggera

### Implementazione in MatchChat.tsx
```tsx
const isAdminMessage = msg.display_name === 'ADMIN';

// Nel rendering del nome:
<span className={cn(
  isAdminMessage 
    ? 'text-red-500 font-display font-black text-lg md:text-xl' 
    : 'text-xs font-medium'
)}>
  {msg.display_name}
</span>

// Nel bubble messaggio:
<div className={cn(
  'rounded-lg px-3 py-2 break-words',
  isAdminMessage
    ? 'bg-gradient-to-r from-red-500/20 to-red-600/10 border border-red-500/30 text-base md:text-lg'
    : isOwnMessage ? '...' : '...'
)}>
```

### File da modificare
| File | Azione |
|------|--------|
| `src/components/matches/MatchChat.tsx` | Stile speciale per ADMIN |

---

## 7. Suoni Notifiche durante Match

### Eventi Audio
1. **Match Accepted** - quando qualcuno joina il tuo match
2. **Ready Up** - quando un partecipante clicca ready
3. **User Declared** - quando qualcuno dichiara il risultato

### Implementazione

**Nuovo hook: `src/hooks/useSoundNotifications.ts`**
- Gestisce preferenze utente (localStorage)
- Controlla `prefers-reduced-motion`
- Usa Web Audio API per suonare anche in background

**File audio: `public/sounds/`**
- `notification-match.mp3` - suono match accepted
- `notification-ready.mp3` - suono ready up
- `notification-result.mp3` - suono dichiarazione

**Componente settings: `src/components/settings/SoundSettings.tsx`**
- Toggle ON/OFF
- Slider volume (0-100%)
- Pulsante "Test Sound"

**Integrazione in MatchDetails.tsx**
- Ascolta eventi realtime e triggera suoni appropriati
- Mostra banner "Clicca per abilitare suoni" se autoplay bloccato

### File da creare/modificare
| File | Azione |
|------|--------|
| `src/hooks/useSoundNotifications.ts` | Nuovo hook |
| `src/components/settings/SoundSettings.tsx` | Nuovo componente |
| `public/sounds/*.mp3` | File audio (placeholder, utente può sostituire) |
| `src/pages/MatchDetails.tsx` | Integrazione suoni |
| `src/components/notifications/NotificationsDropdown.tsx` | Link a settings suoni |

---

## 8. Fix Classifica: Ordinamento Corretto

### Problema Attuale
La RPC `get_leaderboard` ordina per `wins DESC, total_earnings DESC`, ma il requisito è ordinare per **coins guadagnati** (earnings).

### Soluzione
Modificare la RPC per ordinare correttamente:

```sql
ORDER BY total_earnings DESC, wins DESC
```

**Primary sort**: `total_earnings` (coins vinti)
**Tie-breaker**: `wins` (numero vittorie)

### Migrazione SQL
```sql
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
RETURNS TABLE (...)
AS $$
  SELECT ...
  ORDER BY total_earnings DESC, wins DESC  -- CAMBIO QUI
  LIMIT p_limit
  OFFSET p_offset;
$$;
```

### UI Update
- Leaderboard.tsx già mostra "ranked by earnings" - nessun cambio necessario
- Aggiungere tooltip/info che spiega il criterio

### File da modificare
| File | Azione |
|------|--------|
| Migrazione SQL | Fix ordering in `get_leaderboard` |
| `src/pages/Leaderboard.tsx` | (opzionale) Aggiungere info tooltip |

---

## Riepilogo File

### Nuovi File
| File | Descrizione |
|------|-------------|
| `src/components/common/PlayerSearchBar.tsx` | Barra ricerca giocatori |
| `src/components/player/PlayerComparisonModal.tsx` | Modale confronto stats |
| `src/components/notifications/NotificationsDropdown.tsx` | Dropdown notifiche |
| `src/hooks/useSoundNotifications.ts` | Hook gestione suoni |
| `src/components/settings/SoundSettings.tsx` | Settings suoni |
| `public/sounds/notification-match.mp3` | Audio match |
| `public/sounds/notification-ready.mp3` | Audio ready |
| `public/sounds/notification-result.mp3` | Audio result |

### File da Modificare
| File | Modifiche |
|------|-----------|
| `src/components/layout/Header.tsx` | Search bar, social icons, tip button, notifications dropdown |
| `src/components/layout/Footer.tsx` | Link social corretti + TikTok |
| `src/components/player/PlayerStatsModal.tsx` | Bottone Compare |
| `src/components/vip/TipModal.tsx` | Selezione utente |
| `src/components/matches/MatchChat.tsx` | Stile ADMIN |
| `src/pages/MatchDetails.tsx` | Integrazione suoni |
| `src/pages/Leaderboard.tsx` | Info tooltip ordinamento |

### Migrazioni Database
| Migrazione | Descrizione |
|------------|-------------|
| `search_players_public` | RPC ricerca giocatori |
| Fix `get_leaderboard` | Ordinamento per earnings |

---

## Animazioni e Stile Premium

### Standard Applicati
- Transizioni: `transition-all duration-200`
- Hover scale: `hover:scale-[1.02]`
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring`
- Backdrop blur: `backdrop-blur-sm`
- Ombre: `shadow-lg shadow-primary/10`
- Glow oro: `drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]`

### Componenti con Animazioni
- Dropdown notifiche: `animate-in fade-in-0 zoom-in-95`
- Modali: backdrop blur + scale in
- Bottoni: shimmer effect on hover
- Search results: fade in staggered

---

## Note Tecniche

### Audio Web API
- Usa `AudioContext` per controllo volume
- Gestisce `prefers-reduced-motion` rispettando accessibilità
- Fallback se autoplay bloccato: mostra banner interattivo
- Salva preferenze in `localStorage` con chiave `oleboy_sound_settings`

### Performance
- Search bar: debounce 300ms
- Notifications: già cached via `useNotifications` hook
- Comparison modal: fetch parallelo entrambi gli stats
