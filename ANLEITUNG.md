# MovieBox – Anleitung

Diese Anleitung wächst mit den Ausbaustufen. In **Stufe 1** gibt es noch keine Bibliothek und keinen Player – nur das Grundgerüst (Server, Konten, Anmeldung).

## Erste Schritte nach der Installation

1. **Admin-Token notieren.** Das Installationsskript gibt am Ende das `API_TOKEN` aus. Das ist der erste Admin-Zugang; damit kannst du die API ansprechen und später den Web-Player öffnen.
2. **Web-Login prüfen.** Öffne die eingerichtete Adresse (z. B. `https://movies.deine-domain.de`). Die Login-Seite ist absichtlich sehr schlicht – sie prüft nur, ob der Server läuft und die Datenbank erreichbar ist. Erfolgsmeldung = alles ok.
3. **Eigenes Passwort setzen.** Für den Admin ist beim ersten Start noch kein Passwort gesetzt (nur das `API_TOKEN`). Über `POST /api/me/password` kannst du eins vergeben:

   ```sh
   curl -X POST https://deine-domain.de/api/me/password \
     -H "Authorization: Bearer $API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"password":"ein-starkes-passwort"}'
   ```

4. **Weitere Konten (optional).** `POST /api/admin/users` legt ein zusätzliches Konto an. Du brauchst das nur, wenn außer dir noch jemand MovieBox nutzen soll.

## API-Endpunkte in dieser Stufe

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/health` | Server-Statusanzeige (frei zugänglich). |
| `POST` | `/api/login` | Login mit Benutzername + Passwort. |
| `POST` | `/api/invite/accept` | Einladung einlösen (für ein neues Gerät). |
| `GET` | `/api/me` | Eigenes Konto. |
| `POST` | `/api/logout` | Aktuelles Gerät abmelden. |
| `PATCH` | `/api/me` | Benutzername / Anzeigename ändern. |
| `POST` | `/api/me/password` | Eigenes Passwort setzen. |
| `POST` | `/api/me/invite` | Einladungscode für neues Gerät erstellen. |
| `GET` | `/api/admin/users` | Alle Konten (nur Admin). |
| `POST` | `/api/admin/users` | Konto anlegen (nur Admin). |
| `DELETE` | `/api/admin/users/:id` | Konto löschen (nur Admin). |
| `POST` | `/api/admin/users/:id/password` | Passwort eines Kontos zurücksetzen (nur Admin). |
| `POST` | `/api/admin/server-token/rotate` | Neues `API_TOKEN` erzeugen (nur Admin). |
| `GET` | `/api/admin/status` | Server-Kurzstatus (Version, Node, Uptime, RAM). |

## Problemlösung

- **„Der Dienst startet nicht"** – `sudo journalctl -u moviebox -n 50` zeigt die letzten Zeilen. Häufigste Ursache: MongoDB nicht erreichbar.
- **„Benutzername oder Passwort falsch"** auch beim ersten Versuch – wahrscheinlich hast du noch kein Passwort gesetzt. Nutze das `API_TOKEN` als Bearer-Token (siehe Schritt 3 oben), um dir eins einzurichten.
- **nginx meldet 502** – der Node-Dienst ist nicht gestartet. `sudo systemctl status moviebox`.

## Ausbaustufen

Siehe `README.md`. Jede Stufe erweitert diese Anleitung um die neuen Funktionen.
