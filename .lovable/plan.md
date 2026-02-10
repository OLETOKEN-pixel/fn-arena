

Piano INSANE Neon Cyberpunk Glass UI (2D + fake 3D)
0) Obiettivo e regole non negoziabili

Zero changes di logica: match engine, creazione/join, wallet, pagamenti, voting realtime, API, database, routing, business rules non si toccano.

Cambi solo UI/UX visual: theme, colori, spacing, typography, component styling, animazioni, overlay, stati, layout (puoi spostare header/sidebar se non rompe la logica).

Copertura totale: ogni pagina, ogni sezione, ogni overlay, ogni dropdown, ogni toast, ogni stato (loading/empty/error/disabled/hover/focus/active) deve essere ridisegnato.

Qualità prima di quantità: meglio ridisegnare 100% delle superfici e microstati, anche se non aggiungi feature.

Deliverable finale: la piattaforma sembra “nuova”, più premium di Elite, con firma visiva riconoscibile (glow/edge/shine/depth), coerente ovunque.

1) Identità visiva: firma “wow” (quello che rende riconoscibile il sito)

Il redesign deve avere una “signature” ripetibile ovunque, non solo palette:

A) Neon Edge System
Bordi “vivi” con gradient cyan→magenta→violet, con un leggero movimento (solo su elementi hero/CTA).

B) Glass Depth System a 3 livelli
Tre livelli di superfici (background/panel/card/overlay) con blur e ombre differenziate. Serve per non risultare piatto.

C) Shine Sweep (riflesso premium)
Un “colpo di luce” che passa su CTA e card premium con frequenza lenta, mai fastidiosa.

D) Fake 3D Hover
Tilt leggerissimo + ombre multilayer + highlight interno. Deve essere elegante, non “giocattolo”.

E) Motion language coerente
Tutte le animazioni hanno la stessa logica (durate/easing), così sembra un prodotto serio.

2) Design tokens: palette, gradienti, scale, regole di contrasto
2.1 Palette (6 colori principali + derivati)

Base

Midnight: #0B0B1A (background)

Deep Indigo: #0F0F23 (surface base)

Neon Cyan: #00FFFF (primary / focus / highlight)

Neon Magenta: #FF00FF (accent / energetic / error-ish)

Violet: #7C3AED (secondary accent)

Gold: #F7B500 (coins / premium)

Derivati (obbligatori per coerenza, non usare verde/rosso “puri” a caso)

Success: cyan-shift (tende al turchese, non verde puro)

Warning: gold

Error: magenta-shift (non rosso puro)

Text: near-white + grigi freddi coerenti

Regola fondamentale contrasto:

Cyan = azione (primary action)

Gold = soldi/coins/VIP (solo lì)

Magenta/Violet = energia/alert/accents (non ovunque)

2.2 Gradienti “firma”

Gradient Neon: linear-gradient(135deg, cyan, magenta 55%, violet)

Gradient Indigo Premium: linear-gradient(180deg, #0F0F23, #0B0B1A)

Gradient Gold Premium: linear-gradient(135deg, #F7B500, #FFD36A)

2.3 Spacing & radius

Grid spacing: 12 / 16 / 24 / 32 / 48 (niente numeri casuali)

Radius globale: 18px (premium)

Componenti grandi (hero card/modals): 22–26px

3) Background globale: “insane” ma leggero (NO SPLINE)

Il background deve essere “wow” ma non deve distruggere performance.

Layer stack consigliato (tutti CSS)

Base gradient midnight→indigo

Soft cyber radial glows (3-4 macchie grandi blur 20–40px)

Cyber grid ultra soft (repeating-linear-gradient con opacità 0.03–0.06)

Scanline leggerissima (0.02–0.04) con drift lento

Noise overlay (SVG noise) opacity 0.06–0.10, mix-blend overlay

Vignette (radiale scuro ai bordi per focus)

Regole:

Animazioni disabilitate su prefers-reduced-motion.

Su mobile: riduci blur, riduci layer, riduci opacità, evita filtri pesanti.

Opzione WebGL pronta (solo se necessario e ben ottimizzata)

tsParticles (molto controllabile, spesso più leggero di three.js)

Vanta.js (ma attenzione performance)
Se lo usi: deve essere opzionale e degradare bene. Default: CSS.

4) Sistema di superfici: 3 livelli di profondità (anti “piatto”)

Obbligatorio: ogni componente deve appartenere a uno dei 3 livelli.

Surface 1: panels / contenitori pagina

background: indigo scuro con bassa opacità

blur: 10–14px

shadow: morbida

Surface 2: cards / elementi interattivi

background: più “glass”

blur: 18–24px

border: 1px white 0.06–0.10

shadow: profonda + highlight interno inset

Surface 3: overlays / dropdown / modali

background: più opaco (leggibilità)

blur: 24–30px

edge neon soft opzionale

shadow: molto profonda

Se non imponi questa gerarchia, la UI resterà “carina” ma non premium.

5) Motion system: animazioni eleganti, ovunque

Regole globali motion

Durate standard: 160ms (micro), 220ms (hover), 280ms (overlay), 420ms (hero)

Easing premium: cubic-bezier(0.2, 0.8, 0.2, 1)

Mai “rimbalzi” cartoon, solo elasticità leggerissima sui momenti “win” o “match found”.

Microinteractions obbligatorie

Hover card: lift 2px + shadow premium + bordo neon soft + highlight interno

Press: scale 0.98, glow ridotto

Focus input: ring cyan + inner glow

Tabs: underline neon animated

Dropdown open: fade + blur-in + slight scale

Toast: slide-in + glow controllato

Skeleton: shimmer coerente con palette (non grigio random)

Signature animations (solo per elementi chiave)

Shine sweep su CTA premium (ogni 6–10s)

Neon edge animated su card hero e modals VIP/buy (molto lento)

6) Component library: ridisegno totale dei mattoni base

Questa è la parte che “cascata” su tutto il sito.

6.1 Card

Varianti obbligatorie

card-default (surface-2)

card-premium (surface-2 + neon edge + shine)

card-compact (per liste)

card-interactive (hover/press)

Dettagli “fake 3D”

doppia ombra: una soft + una tight

inset highlight: 1px white 0.06–0.10

overlay gradient on hover (cyan/magenta leggerissimo)

6.2 Button

Varianti obbligatorie

primary neon (cyan)

premium neon gradient (cyan→magenta→violet)

gold coin (solo coins)

ghost (testo + underline neon on hover)

danger (magenta-shift, non rosso)

Micro: ripple controllato (non enorme), shimmer solo su premium.

6.3 Input / Search / Select

Input glass: background rgba indigo, blur, border soft

Focus: ring cyan + glow magenta leggerissimo

Search bar: expand on focus (desktop), con icona glow

Select/Dropdown: surface-3, niente menu “piatti”

6.4 Badge / Status pill

Obbligatorio: stati sempre leggibili

OPEN: cyan pill con glow soft

WON: gold highlight (o cyan + gold accent)

LOST: magenta premium (non rosso piatto)

CANCELED: muted con bordo

6.5 Progress / Slider / Switch

Progress: shimmer line, dot neon

Switch: track glow + knob light

6.6 Toast / Tooltip

Toast: surface-3 + neon edge soft, icon glow

Tooltip: piccolo, leggibile, glass premium

7) Layout: ristruttura per “wow” (senza rompere logica)

Puoi cambiare layout, e qui serve farlo per evitare “sito normale”.

7.1 Header

Header glass “floating” (surface-1/2)

Search: pill espandibile

Coins: pill gold con micro shine

Notifications: popover surface-3 con tab underline neon

Avatar: orb ring (border neon), dropdown premium

7.2 Sidebar

Sidebar più “tattile”: indicator neon verticale + background depth

Active item: glow + left bar gradient neon

Hover: icon glow + background tint

CTA “Create Match”: premium neon gradient con shimmer slow

“Buy Coins”: gold, sempre riconoscibile

7.3 Content area

Riduci “vuoto morto”: sezioni più compatte, card più larghe, spacing coerente

Tutte le pagine devono avere: header section + content section + empty/loading system

7.4 Mobile

BottomNav glass, active dot neon

Sidebar diventa sheet con animazione premium

Performance-first: riduci blur e glow

8) Overlay/Modal stack: deve essere perfetto e coerente

Questa parte spesso è “brutta” anche in siti belli.

Regole

Tutti gli overlay condividono lo stesso backdrop system

Backdrop: blur + tint indigo + noise leggero

Content: surface-3

Z-index standard: modal > sheet > popover > dropdown > tooltip

Animazioni

Open: fade-in + blur-in + scale 0.98→1

Close: reverse con 120–180ms

Stati overlay obbligatori

confirm modal

error modal

success modal

vip modal

coins overlay
Tutti devono sembrare “premium” uguale.

9) Page-by-page: cosa deve cambiare (grafica + animazioni) su ogni pagina

Qui l’idea è: ogni pagina deve avere 1 “signature moment” visivo, senza aggiungere feature.

9.1 Home

Signature moment

Hero card premium (surface-2 premium) con neon edge + shine sweep

CTA primarie: premium neon + ripple + micro pulse

Sezione “Live Matches” empty state: icona fluttuante + CTA glow

Micro

Hover su card: tilt leggero

Sezione progress: shimmer progress + badge glow

9.2 Matches (Live Matches)

Signature moment

Filter bar “rail” glass con underline neon animato

Match cards: super clean e premium (anche qui: card-interactive + gold CTA)

Regole match card (grafica)

Mostrare solo: modalità (unita con size) es “1v1 Box Fight”, FT, entry fee coin icon, prize coin icon, CTA join

Togli tutto ciò che confonde visivamente

Icone coin sempre, niente simbolo €

Micro

JOIN button gold con shine soft

card hover: lift + neon border + background gradient overlay

9.3 My Matches

Signature moment

Cards “completed” con status pill enorme e chiaro (WON gold, LOST magenta premium)

Avversario: sempre visibile (no “?”), con avatar ring e mini glow

Regole team modes

2v2/3v3/4v4: mostra solo creator del match e primo accepter dell’altro team (come hai richiesto), ma in UI deve sembrare intenzionale: “Primary players” con piccolo badge “Team”.

Micro

View details button ghost premium con underline neon

9.4 Match Details

Signature moment

Card “Match Summary” premium con layout pulitissimo

Sezione players con card mini “player chip” (orb avatar + glow ring)

Stato match (open/resolved/canceled) come badge “hero”

9.5 Create Match

Signature moment

Wizard-like layout (solo UI): step indicator neon (senza cambiare logica)

Ogni select: glass premium, focus ring neon

Preview card match: mostra live come apparirà la card (solo UI)

9.6 Leaderboard (all-time)

Signature moment

Podium top 3: cards premium animate

#1 gold glow + crown + ring animate

#2 silver-ish (indigo + cyan edge)

#3 bronze-ish (indigo + magenta edge)

Animazione obbligatoria: “podium rise” + shine + halo

Regole dati

Solo wins e coins won (come hai richiesto)

Tabella sotto: hover row con neon rail laterale

9.7 Highlights

Signature moment

Banner sempre visibile, spiegazione chiara, super premium

Voting UI: non un’icona brutta; deve essere un componente premium (pulsante + counter animato)

Grafica voting (senza toccare realtime logic)

Stato “votato”: bottone cambia in “Voted” con glow, possibilità “Remove vote”

Stato “non votato”: CTA “Vote” premium

Counter si aggiorna realtime: micro animazione “count pop” (solo UI)

Non deve mai richiedere refresh pagina: UI reattiva

9.8 Teams / Team Details

Signature moment

Empty state con card premium “Create your first team”

Team cards: badge size mode (2v2/3v3/4v4) con neon pills

9.9 Wallet

Signature moment

Balance card con heartbeat glow lento (molto elegante)

Lista transazioni: slide-in items + hover glow rail

Buy coins CTA gold premium con shine

9.10 Buy Coins / Payments / Success / Cancel

Signature moment

Checkout overlay premium, steps UI pulita

Success: confetti minimale (2D) o glow burst, non infantile

Cancel: card muted ma premium

9.11 Profile + Settings (Account/Game/Payments/Connections)

Signature moment

Profile header card con avatar orb ring

Menu settings: tabs/pills con underline neon

Save button premium con feedback “saved” (toast premium)

9.12 Auth / Callback pages / NotFound

Signature moment

Auth card: surface-3, neon edge, focus ring perfetto

Callback: loader token rotate (2D) + glow

NotFound: big neon typography + CTA back

9.13 Admin pages

Signature moment

Tabelle admin: row hover neon rail + sticky header glass

Modali admin: surface-3, leggibilità altissima

10) Stati globali: loading/empty/error devono essere “wow”

Questa è una delle parti più importanti per sembrare premium.

Loading

Skeleton shimmer coerente (indigo + neon reflect)

Su card grandi: skeleton con “shine line” molto soft

Empty

Icon + testo + CTA, ma in card premium

Piccola animazione float 3–5s loop

Error

Non rosso piatto: magenta premium con icon glow

CTA “retry” neon

Disabled

Riduci saturazione + glow off + cursor not-allowed, ma sempre elegante

11) Performance e accessibilità (per non creare un sito lento)

Regole performance

Blur: usare blur moderati, non 60px ovunque

Glow: box-shadow multipli solo su hover o su pochi elementi hero

Animazioni: preferire transform/opacity, evitare layout thrash

Mobile: ridurre layers background e filtri

Accessibilità

Contrast text minimo garantito

Focus outline sempre visibile (cyan ring)

prefers-reduced-motion: disattivare shine/edge animations e background drifting

12) Processo di lavoro (come farlo davvero senza caos)

Fase A: Foundation

Tokens + background + surface levels + motion system

Fase B: Component library

Card/Button/Input/Badge/Modal/Dropdown/Toast/Tooltip/Progress

Fase C: Layout

Header/Sidebar/BottomNav/MainLayout

Fase D: Pagine (una per una)

Home → Matches → MyMatches → Wallet → Leaderboard → Profile → Highlights → Teams → resto

Fase E: Stati globali

loading/empty/error/disabled ovunque

Fase F: QA visiva e refactor finale

pulizia hardcode, coerenza spacing, riduzione eccessi glow

13) Checklist di accettazione “wow” (se non passa, si rifà)

In 3 secondi, differenza evidente: background + depth + neon edge + motion

Ogni overlay sembra premium e coerente

Ogni dropdown/tooltip/toast è glass neon, non “default”

Match cards: pulite, premium, leggibili, con coin icon coerenti

Leaderboard podium: top3 spettacolare, animato, all-time

Highlights voting: UI premium e chiara, stati “vote/remove” bellissimi

Mobile: non lagga, mantiene stile, blur ridotto, leggibile

14) “Nota finale” davvero obbligatoria (la regola madre)

Se una modifica grafica non è chiaramente visibile e non sembra premium, è da rifare.
Non voglio un restyling “carino”: voglio un ribaltamento totale con firma cyberpunk glass, depth, neon edge e micro-animazioni eleganti su ogni elemento (pagine, modali, dropdown, empty/loading/error).
Meglio ridurre l’intensità che fare caos: ma ogni cosa deve sembrare progettata da un team top-tier, non da template.