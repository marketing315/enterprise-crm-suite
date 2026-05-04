import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Informativa Privacy & uso dello storage tecnico del browser.
 *
 * Pagina pubblica (no auth) richiamata dal footer di /login e /reset-password
 * e raggiungibile direttamente via /privacy.
 *
 * Copre l'esenzione art. 5(3) Direttiva 2002/58/CE (ePrivacy) e gli
 * obblighi informativi GDPR art. 13 per il trattamento "esecuzione del
 * contratto" art. 6(1)(b).
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link to="/login">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna al login
          </Link>
        </Button>

        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">
          Informativa Privacy
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Ultimo aggiornamento: 4 maggio 2026
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold">1. Titolare del trattamento</h2>
            <p>
              Gruppo Benessere — di seguito "il Titolare". Per richieste in
              materia di protezione dei dati: scrivere al referente privacy
              interno indicato in azienda.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Natura del servizio</h2>
            <p>
              Questa applicazione (CRM Gruppo Benessere) è uno strumento di
              <strong> back-office riservato a operatori autorizzati</strong>.
              Non è un sito web pubblico né un servizio rivolto a utenti
              finali/consumatori. L'accesso richiede sempre autenticazione
              tramite credenziali aziendali nominali.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              3. Storage tecnico nel browser
            </h2>
            <p>
              Per funzionare, l'applicazione memorizza nel browser le seguenti
              informazioni. Tutte rientrano nell'esenzione prevista dall'art.
              5, paragrafo 3 della Direttiva ePrivacy 2002/58/CE
              ("strettamente necessari alla fornitura del servizio
              esplicitamente richiesto dall'utente") e quindi{" "}
              <strong>non richiedono consenso preventivo</strong>:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Token di sessione (localStorage)</strong> — chiave{" "}
                <code>sb-*-auth-token</code>. Necessario per mantenere
                l'accesso dopo il login. Durata: fino al logout o alla
                scadenza del token (1 ora con auto-refresh).
              </li>
              <li>
                <strong>Cache funzionale (localStorage)</strong> — chiave{" "}
                <code>crm_query_cache</code>. Contiene esclusivamente dati di
                configurazione non sensibili (anagrafica brand, tag, prodotti,
                fasi pipeline). Durata massima: 4 ore. Cancellata
                automaticamente al logout.
              </li>
              <li>
                <strong>Preferenze UX (localStorage)</strong> — chiavi
                prefissate con l'identificativo utente. Memorizzano filtri
                personali, viste salvate, impostazioni della dashboard. Durata:
                fino a cancellazione manuale o logout.
              </li>
              <li>
                <strong>Service Worker (Cache Storage)</strong> — solo asset
                statici (JS, CSS, immagini). Nessun dato personale viene
                cachato. Le risposte API/Auth/RLS sono escluse dalla cache per
                garantire la corretta applicazione delle autorizzazioni.
              </li>
              <li>
                <strong>Notifiche push (opzionale)</strong> — sottoscrizione
                Push API attivabile dall'utente nelle impostazioni. Cancellata
                disattivando le notifiche o disinstallando l'app.
              </li>
            </ul>
            <p className="mt-3 rounded-md border border-border bg-muted/50 p-3 text-sm">
              <strong>Nessun cookie di profilazione, analytics o
              marketing</strong> viene installato dall'applicazione.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Categorie di dati trattati</h2>
            <p>Nell'ambito del rapporto di lavoro vengono trattati:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Dati identificativi dell'operatore (nome, email aziendale, ruolo);</li>
              <li>Log di accesso e di attività (audit trail) per finalità di sicurezza;</li>
              <li>
                Dati di clienti, lead, appuntamenti e altri dati operativi
                gestiti tramite il CRM (per i quali il trattamento è regolato
                dall'informativa specifica fornita all'interessato in fase di
                acquisizione del lead).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Base giuridica</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong>Art. 6(1)(b) GDPR</strong> — esecuzione del contratto
                di lavoro / fornitura dello strumento di lavoro.
              </li>
              <li>
                <strong>Art. 6(1)(f) GDPR</strong> — legittimo interesse del
                Titolare alla sicurezza informatica e alla tracciabilità delle
                operazioni (audit log).
              </li>
              <li>
                <strong>Art. 6(1)(c) GDPR</strong> — adempimento di obblighi
                legali (conservazione documenti contabili, fatturazione).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Conservazione</h2>
            <p>
              I dati operativi sono conservati per la durata del rapporto e
              successivamente per i tempi di legge (art. 2220 cc per i
              documenti contabili: 10 anni). Gli audit log sono conservati 24
              mesi. I dati di sessione del browser sono cancellati al logout.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              7. Diritti dell'interessato (art. 15-22 GDPR)
            </h2>
            <p>L'utente ha diritto di:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>accedere ai propri dati e ottenerne copia;</li>
              <li>chiederne la rettifica o l'aggiornamento;</li>
              <li>
                chiederne la cancellazione, nei limiti consentiti dagli
                obblighi di conservazione legale;
              </li>
              <li>opporsi al trattamento o chiederne la limitazione;</li>
              <li>
                proporre reclamo al Garante per la Protezione dei Dati
                Personali (<a
                  href="https://www.garanteprivacy.it"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  garanteprivacy.it
                </a>
                ).
              </li>
            </ul>
            <p>
              Per esercitare questi diritti, contattare il referente privacy
              interno.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Trasferimenti extra-UE</h2>
            <p>
              L'infrastruttura di hosting (database, edge functions, storage)
              risiede in data center europei. Eventuali sub-processor extra-UE
              utilizzati per servizi accessori (es. Google Workspace,
              integrazione marketing) operano sotto Standard Contractual
              Clauses approvate dalla Commissione Europea.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Modifiche all'informativa</h2>
            <p>
              Eventuali modifiche sostanziali verranno comunicate via email
              aziendale e segnalate in homepage all'accesso successivo.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
