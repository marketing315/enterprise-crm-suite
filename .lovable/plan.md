

## Piano: Pulsante "Dettagli" negli appuntamenti

### Cosa cambia

1. **Nuova pagina `AppointmentDetail`** — una pagina dedicata che mostra tutti i dati dell'appuntamento (data/ora, durata, contatto con telefono/email, indirizzo completo, stato, tipo, venditore assegnato, note, deal collegato).

2. **Nuova rotta** — aggiungere `/appointments/:id` in `App.tsx`.

3. **Pulsante "Dettagli" nel dropdown azioni** — nella tabella appuntamenti (`Appointments.tsx`) e nella card mobile (`AppointmentCard.tsx`), aggiungere una voce "Dettagli" nel menu a tendina che naviga a `/appointments/{id}`.

### Dettagli tecnici

**File nuovi:**
- `src/pages/AppointmentDetail.tsx` — pagina dettaglio con `useParams` per leggere l'id, query diretta alla tabella `appointments` con join su contatto e venditore, layout card con tutte le info, pulsante indietro, e azioni rapide (cambia stato, assegna venditore).

**File modificati:**
- `src/App.tsx` — aggiungere `<Route path="/appointments/:id" element={<AppointmentDetail />} />`
- `src/pages/Appointments.tsx` — aggiungere `useNavigate`, inserire voce "Dettagli" con icona `Eye` come primo item nel `DropdownMenuContent` (riga ~458), con `onClick={() => navigate(`/appointments/${apt.id}`)}`
- `src/components/appointments/AppointmentCard.tsx` — stessa voce "Dettagli" nel dropdown menu della card mobile

