

## Piano: Redesign C-Level del modulo Appuntamenti

### Problemi attuali

1. **Vista settimanale troppo compressa** — 7 colonne su desktop rendono le card illeggibili, su mobile collassano verticalmente senza gerarchia
2. **Card appuntamento piatta** — nessun glassmorphism, nessuna animazione, emoji nei menu (✓, ✗, 🏠, ⚠️), aspetto "form admin" non "Apple-like"
3. **Header e filtri disallineati** — filtri su riga separata senza raggruppamento visivo, nessun conteggio appuntamenti
4. **Dialog creazione monolitico** — un solo scroll lungo, nessuna separazione visiva tra sezioni, nessun feedback di progresso
5. **Nessun stato empty premium** — il testo "Nessun appuntamento" è minimale, manca un'illustrazione o CTA
6. **Manca indicatore visivo per oggi** — solo `ring-2` sulla card colonna, nessun dot/pulse per l'orario corrente

### Modifiche pianificate

#### 1. Nuovo layout pagina `Appointments.tsx`

- Header con icona in cerchio glassmorphism (`backdrop-blur-sm bg-background/80`), conteggio badge animato
- Filtri integrati nell'header con chip/pill toggle per stato (invece di Select dropdown)
- Navigazione settimana con animazione di transizione (fade)
- Vista settimanale: su desktop griglia 7 colonne con altezza fissa e scroll interno per colonna; su mobile vista lista giornaliera (mostra solo il giorno selezionato con swipe-like day selector)
- Indicatore "now" con linea orizzontale rossa pulsante nella colonna di oggi

#### 2. Redesign `AppointmentCard` (nuovo componente)

- Estrarre in `src/components/appointments/AppointmentCard.tsx`
- Glassmorphism: `bg-background/60 backdrop-blur-sm border border-border/50`
- Status come dot colorato (non badge) + label piccola
- Tipo appuntamento come pill sottile in alto
- Layout: orario prominente a sinistra, info contatto a destra
- Hover: leggero scale + shadow elevation
- Menu azioni con icone Lucide (no emoji), raggruppate in sezioni (Stato / Assegnazione)
- Animazione staggered all'ingresso (`animate-in` con delay incrementale)

#### 3. Mobile-first day selector

- Su viewport `< md`: barra orizzontale con 7 giorni come cerchi (giorno selezionato = primary, oggi = dot), tap per mostrare lista
- Sotto la barra, lista verticale degli appuntamenti del giorno selezionato
- Swipe gesture opzionale (scroll orizzontale nativo)

#### 4. Redesign `NewAppointmentDialog`

- Passaggio a layout multi-step con indicatore di progresso (3 step: Contatto → Dettagli → Qualificazione)
- Ogni step ha titolo e sottotitolo
- Ricerca contatto con risultati più ricchi (avatar iniziali, telefono, email inline)
- Transizione smooth tra step
- Footer con navigazione Indietro/Avanti + contesto step corrente
- Glassmorphism su DialogContent

#### 5. Empty state premium

- Illustrazione vettoriale (icona Calendar grande + cerchi decorativi in CSS)
- Testo motivazionale + CTA "Nuovo Appuntamento"
- Animazione fade-in

#### 6. Conteggio e statistiche rapide

- Sotto l'header: 3 mini-KPI pill (Tot. settimana, Confermati, Da confermare) con numeri animati

### File coinvolti

| File | Azione |
|---|---|
| `src/pages/Appointments.tsx` | Riscrittura completa layout, header, filtri, vista mobile |
| `src/components/appointments/AppointmentCard.tsx` | Nuovo componente card C-level |
| `src/components/appointments/AppointmentDaySelector.tsx` | Nuovo componente mobile day picker |
| `src/components/appointments/AppointmentWeekStats.tsx` | Nuovo componente mini-KPI |
| `src/components/appointments/NewAppointmentDialog.tsx` | Redesign multi-step |
| `src/components/appointments/LeadQualificationFields.tsx` | Solo styling (spaziatura, bordi arrotondati) |

### Non modificato

- Hook `useAppointments` e le altre mutation (logica backend invariata)
- `ClinicalTopicsSelector` (solo styling minore ereditato)

