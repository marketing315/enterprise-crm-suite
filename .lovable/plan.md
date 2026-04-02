

## Piano: Esportazione contatti in XLSX

Esporterò tutti i 523 contatti dal database in un file Excel con le seguenti colonne:

- **Nome**
- **Cognome**
- **Telefono** (numero primario)
- **Data creazione**
- **Brand**

### Dettagli tecnici

1. Query `psql` per estrarre tutti i contatti con join su `contact_phones` (primary) e `brands`
2. Script Python con `openpyxl` per generare il file XLSX formattato (header in grassetto, colonne auto-dimensionate, date in formato italiano dd/mm/yyyy)
3. Output in `/mnt/documents/contatti_export.xlsx`

Un singolo file, nessuna modifica al codice del progetto.

