# 🏥 MedLogix - Gestione Magazzino Presidi Sanitari & Emergenza

Applicazione web professionale, moderna e pronta all'uso per la gestione dell'inventario, lotti con scadenze (metodo FEFO), registrazioni di carico/scarico e piano di riordino per ambulanze, presidi territoriali e reparti di primo soccorso.

L'applicazione è stata generata e pre-popolata partendo direttamente dal foglio dati CSV del magazzino:
- **64 Presidi Sanitari a catalogo** con giacenze attuali e soglie minime di scorta
- **204 Registrazioni di Carico Merce** con tracciamento lotti e date di scadenza
- **868 Movimenti di Scarico Storici** con destinazioni su ambulanze e reparti operativi

---

## 🚀 Come Avviare l'Applicazione

Non è richiesta alcuna installazione, né Node.js o server complessi. Puoi avviarla in tre modi semplici:

1. **Doppio click sul file**: Fai doppio click su `apri_magazzino.bat`.
2. **Apertura diretta**: Fai doppio click su `index.html` per aprirla in Microsoft Edge, Google Chrome, Firefox o qualunque browser.
3. **Imposta come Workspace**: Per lavorare direttamente su questo progetto nell'IDE, apri la cartella:
   `C:\Users\simoz\.gemini\antigravity\scratch\gestione-magazzino`

---

## 📋 Funzionalità Principali

### 1. Dashboard Direzionale & KPI in Tempo Reale
- **Totale Articoli e Unità**: Panoramica delle giacenze complessive (migliaia di pezzi monitorati).
- **Radar Sottoscorta**: Rilevamento istantaneo degli articoli critici (esauriti o sotto il quantitativo minimo).
- **Monitor Scadenze Imminenti**: Avviso preventivo per i lotti con scadenza inferiore a 90 o 180 giorni.
- **Grafici Interattivi (Chart.js)**:
  - Andamento mensile movimentazioni (Carichi vs Scarichi).
  - Top presidi più consumati e richiesti.
  - Ripartizione giacenze per categoria merceologica.

### 2. Gestione Catalogo & Giacenze
- **Ricerca Istantanea**: Filtra in tempo reale per nome presidio, codice (`MED-101`) o categoria.
- **Filtri di Stato Rapidi**: "Tutti", "🚨 Sottoscorta", "⛔ Esauriti (Zero)", "⏳ Scadenze Vicine", "✅ Regolari".
- **Doppia Visualizzazione**: Tabella operativa dettagliata o griglia a schede (cards).
- **Azioni Rapide per Riferimento**:
  - Pulsante `+ Carica` per rifornimento immediato.
  - Pulsante `- Scarica` per prelievo su mezzo di soccorso.
  - Pulsante modifica per aggiornare la scorta minima o i dati del presidio.

### 3. Tracciamento Lotti e Metodo FEFO (First Expired First Out)
- Ordinamento automatico dei lotti per scadenza più ravvicinata.
- Calcolo automatico dei giorni rimanenti con badge semaforici:
  - 🔴 **Scaduto**
  - 🟠 **Critico (&lt; 90 giorni)**
  - 🟡 **In scadenza (90 - 180 giorni)**
  - 🟢 **Regolare (&gt; 180 giorni)**
  - ⚪ **Durevole (Nessuna scadenza)** per presidi metallici, pile, forbici, contenitori.
- Nel modulo di scarico, il sistema **suggerisce automaticamente quale lotto consumare prioritariamente** per azzerare gli sprechi.

### 4. Registro Completo Movimentazioni
- Elenco cronologico di tutti i carichi e scarichi (oltre 1000 record).
- Filtri per tipologia (Solo Carichi Inbound / Solo Scarichi Outbound).
- Filtri temporali (Ultimi 30 giorni, 90 giorni, tutto lo storico).
- Paginazione fluida per consultazione rapida.

### 5. Algoritmo Automatico Riordino Fornitori
- Analizza automaticamente tutti gli articoli sottoscorta.
- Calcola il fabbisogno netto e la quantità ottimale di riordino per ripristinare il livello di sicurezza.
- Permette di modificare i quantitativi da ordinare.
- **Stampa Scheda Ordine**: Layout ottimizzato per la stampa cartacea o PDF da inviare ai fornitori.
- **Esportazione Ordine in Excel**: File CSV formattato per i gestionali fornitori.

### 6. Gestione & Ridenominazione Mezzi Assegnatari (Ambulanze, Reparti, Zaini)
- Nuova sezione dedicata **"Mezzi & Reparti"**:
  - Visualizza tutti i mezzi con relative statistiche di consumo.
  - **Pulsante "Rinomina"**: permette di cambiare il nome di un mezzo in qualsiasi momento (es. da *Ambulanza Bravo 1* a *Charlie 1*).
  - Opzione per **aggiornare automaticamente lo storico**: quando rinomini un mezzo, tutti i movimenti passati vengono aggiornati al nuovo nome per mantenere la coerenza statistica.
  - Possibilità di aggiungere nuovi mezzi (Automediche, Zaini, Postazioni distaccate) ed eliminare mezzi dismessi.

### 7. Supporto Completo Smartphone & Tablet (Mobile Responsive)
- **Menu Drawer a scomparsa**: su smartphone la barra laterale diventa un cassetto scorrevole azionabile dal pulsante menu `☰`.
- **Interfaccia Touch-Friendly**: pulsanti ampi, schede responsive e modali a schermo intero adatti all'uso su smartphone in ambulanza o in magazzino.
- **Accesso Wireless da Telefono**: eseguendo `avvia_per_smartphone.bat` sul PC, viene condivisa l'applicazione sulla rete Wi-Fi locale (es. `http://192.168.1.XX:8080`) per aprirla su qualsiasi iPhone o Android.

### 8. Persistenza Locale & Backup Dati
- **Salvataggio Continuo**: Ogni operazione viene memorizzata automaticamente nel `localStorage` del browser.
- **Esporta CSV per Excel**: Separatori italiani (punto e virgola) per apertura perfetta in Microsoft Excel senza problemi di encoding.
- **Backup Completo JSON**: Scarica l'intero database in un click.
- **Ripristino di Fabbrica**: Pulsante per ripristinare in qualsiasi momento lo stato iniziale del file fornito.

---

## 📁 Struttura dei File

```
C:\Users\simoz\.gemini\antigravity\scratch\gestione-magazzino/
│
├── index.html              # Interfaccia grafica dell'applicazione (Single Page App)
├── app.js                  # Logica applicativa, gestione stato, grafici e persistenza
├── data.js                 # Dataset iniziale strutturato (64 articoli, 204 carichi, 868 scarichi)
├── dati_originali.csv      # File originale sorgente fornito dall'utente
├── database_iniziale.json  # Rappresentazione JSON completa dei dati grezzi
├── apri_magazzino.bat      # Script di avvio rapido con doppio click
└── README.md               # Questa documentazione tecnica e d'uso
```

---

## 🏷️ Categorie Merceologiche Gestite
1. **Vie Aeree & Ventilazione** (Ambu, Cannule Guedel, Maschere O2, Sondini, Filtri, Pocket Mask, Tubi aspiratore)
2. **Medicazione & Bendaggi** (Bende coesive, Cerotti, Fisiologica, Garze sterili, Metallina, Teli sterili)
3. **DPI & Disinfezione** (Guanti S/M/L/XL, Mascherine FFP2, Clorexidina, Disinfettanti presidi)
4. **Diagnostica & Monitoraggio** (Elettrodi ECG, Lancette glicemia, Pungidito, Saturimetri adulto e pediatrico, Termometri)
5. **Strumenti & Presidi Chirurgici** (Abbassalingua, Apribocca a vite/cuneo, Forbici Robin, Pinzette, Lacci emostatici)
6. **Crioterapia** (Buste ghiaccio istantaneo, Ghiaccio spray)
7. **Tessili & Biancheria** (Federe, Lenzuola, Traverse monouso, Rotoli carta)
8. **Smaltimento Rifiuti Sanitari** (Alibox contenitori taglienti da 0,4L e 7L)
9. **Alimentazione & Batterie** (Pile alcaline AA, Pile AAA)
