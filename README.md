# FRICCIOSHOP

PWA installabile per catalogo di vestiti senza acquisto online.

## Funzioni
- Catalogo responsive e installabile come app
- Registrazione e login clienti
- Area Admin protetta da password
- Caricamento foto/articoli direttamente dal telefono
- Categorie, prezzo indicativo, taglie, descrizione
- Pulsante "Mi interessa"
- Salvataggio richieste clienti
- Email automatica al proprietario tramite Resend
- Dati e foto persistenti con volume Railway montato su `/data`

## Variabili Railway
Imposta queste variabili nel servizio:

- `ADMIN_PASSWORD` = una password forte scelta da te
- `JWT_SECRET` = una stringa lunga casuale (almeno 32 caratteri)
- `DATA_DIR` = `/data`
- `OWNER_EMAIL` = la tua email che deve ricevere le richieste
- `RESEND_API_KEY` = chiave API Resend
- `RESEND_FROM` = opzionale, default `FRICCIOSHOP <onboarding@resend.dev>`

## Volume Railway
Crea un volume e montalo su `/data`. Serve per conservare utenti, articoli, foto e richieste anche dopo un redeploy.

## Avvio
Railway rileva automaticamente `npm start`.
