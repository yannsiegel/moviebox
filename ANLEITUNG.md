# MovieBox – Anleitung

Die vollständige Schritt-für-Schritt-Anleitung für den Server und die Android-App.

## Voraussetzungen

Auf dem Server (Ubuntu/Debian):
- **Node.js ≥ 20.6** (empfohlen 22 oder 26). Wenn Node unter `/opt/node-...` installiert ist, siehst du den Pfad mit `which node` oder `ls /opt | grep node`.
- **MongoDB 6+**, erreichbar unter `mongodb://127.0.0.1:27017`.
- **nginx**.
- Empfohlen: eine Subdomain (z. B. `movies.deine-domain.de`), deren DNS-A-Record auf die Server-IP zeigt.

Alles andere – `ffmpeg`, `certbot` – installiert `install.sh` selbst.

## 1. Erstinstallation

```sh
cd /root
git clone https://github.com/yannsiegel/moviebox.git
cd moviebox
sudo bash install.sh
```

Falls Node über eine eigene Installation läuft (nvm, `/opt/node-...`), den Pfad angeben:

```sh
sudo NODE_BIN=/opt/node-v26.13.0/bin/node bash install.sh
```

Das Skript fragt beim ersten Mal nach:

1. **Domain** – z. B. `movies.deine-domain.de`. Leer lassen = nur unter `http://<IP>:8096` erreichbar.
2. **E-Mail** – nur wenn Domain angegeben, für das kostenlose Let's-Encrypt-Zertifikat.
3. **MongoDB-URL** – Enter übernimmt den lokalen Standard.
4. **TMDB-API-Schlüssel** – kostenlos auf [themoviedb.org](https://www.themoviedb.org/settings/api). Darf leer bleiben; die Bibliothek funktioniert dann mit Dateinamen als Titel, lässt sich später nachrüsten.

Danach legt das Skript den Dienst-Benutzer `moviebox` an, kopiert den Server-Code nach `/opt/moviebox/`, legt den Medienordner `/srv/moviebox/media/` an, installiert den systemd-Dienst, richtet nginx + HTTPS ein und startet alles.

Am Ende der Installation werden ausgegeben:
- die **URL** (z. B. `https://movies.deine-domain.de`)
- der **Admin-Token** (`API_TOKEN`): das ist der erste Zugang. Weiterverwenden, bis du ein Passwort gesetzt hast.
- die wichtigsten Pfade.

## 2. Erste Mediendateien

Lege Videodateien in `/srv/moviebox/media/`. Zwei Konventionen:

**Filme** – flach oder in Unterordnern, Jahr im Dateinamen hilft TMDB beim Zuordnen:
```
/srv/moviebox/media/
├── The Matrix (1999).mkv
├── Inception.2010.1080p.mkv
└── Dokus/
    └── Our Planet (2019).mkv
```

**Serien** – als Ordner, mit `S01E02`-Markern oder `Season N/02 - Titel.mkv`-Schema:
```
/srv/moviebox/media/
└── Breaking Bad/
    ├── Season 1/
    │   ├── Breaking.Bad.S01E01.mkv
    │   └── Breaking.Bad.S01E02.mkv
    └── Season 2/
        └── 03 - Bit by a Dead Bee.mkv
```

**Untertitel** – als Sidecar neben der Videodatei, Sprache als Suffix:
```
The Matrix (1999).mkv
The Matrix (1999).de.srt
The Matrix (1999).en.srt
```

Der Scanner läuft alle 5 Minuten automatisch. Sofortigen Scan auslösen:
- in der Web-Oberfläche: oben rechts auf das ↻-Symbol
- per API: `curl -X POST https://movies.deine-domain.de/api/admin/scan -H "Authorization: Bearer DEIN_API_TOKEN"`

Nach dem Scan läuft im Hintergrund der Metadaten-Worker: ein Job pro Datei, ffprobe liest die Datei, TMDB wird gefragt, die Bibliothek wird gefüllt. Bei vielen Dateien kann das ein paar Minuten dauern. Status:
- `curl https://movies.deine-domain.de/api/admin/status -H "Authorization: Bearer DEIN_API_TOKEN"` zeigt die Job-Zahlen.

## 3. Passwort setzen

Über das Admin-Token:

```sh
curl -X POST https://movies.deine-domain.de/api/me/password \
  -H "Authorization: Bearer DEIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"ein-starkes-passwort"}'
```

Danach kannst du dich in Web und App mit Benutzername `admin` und diesem Passwort anmelden.

## 4. Android-App installieren

Die APK wird nach jedem Push nach `app/` automatisch von GitHub Actions gebaut und als Release unter https://github.com/yannsiegel/moviebox/releases veröffentlicht.

1. Auf dem Handy die neueste Version öffnen: https://github.com/yannsiegel/moviebox/releases/latest
2. `MovieBox.apk` herunterladen und öffnen. Android fragt beim ersten Mal nach der Erlaubnis, Apps aus unbekannter Quelle zu installieren – zulassen.
3. In der App: Server-Adresse (z. B. `https://movies.deine-domain.de`), Benutzername `admin`, Passwort. Fertig.

## 5. Update

```sh
cd /root/moviebox && git pull && NODE_BIN=/opt/node-v26.13.0/bin/node bash install.sh
```

Das Skript erkennt die bestehende Installation an der vorhandenen `.env`, übernimmt alle Einstellungen (Domain, API_TOKEN, TMDB-Key, …) und startet nur den Dienst neu. Nichts geht verloren.

## 6. Problemlösung

**Der Dienst startet nicht**
```sh
sudo journalctl -u moviebox -n 50 --no-pager
```
Häufigste Ursache: MongoDB nicht erreichbar. Prüfen: `sudo systemctl status mongod`.

**„Noch keine Inhalte" trotz Dateien im Medienordner**
- Scan manuell auslösen (siehe oben).
- Prüfen, ob der Dienst-Benutzer `moviebox` den Ordner lesen kann: `ls -la /srv/moviebox/media/`. Die Dateien sollten für andere lesbar sein (`chmod -R a+rX /srv/moviebox/media`).
- Dateiendung muss eine der folgenden sein: `.mkv .mp4 .m4v .mov .avi .ts .m2ts .webm .wmv .flv .mpg .mpeg`.

**Film heißt „Breaking Bad S01E05 720p HDTV x264"**
- Du hast noch keinen TMDB-Key eingetragen. Im `.env` nachtragen: `sudo nano /opt/moviebox/server/.env` → `TMDB_API_KEY=…`, speichern, dann `sudo systemctl restart moviebox` und erneut scannen.
- Wenn ein TMDB-Key da ist aber trotzdem keine Treffer kommen: der Dateiname ist für TMDB zu kryptisch oder die Serie heißt dort anders. Umbenennen hilft; manuelles Zuordnen bauen wir in einer späteren Stufe ein.

**Video spielt nicht ab, Fehler „Codec nicht unterstützt"**
- Direct-Play funktioniert bei H.264 + AAC in MP4/MKV in praktisch jedem Browser und auf Android. Bei H.265/HEVC, Dolby Atmos oder exotischen Containern braucht es Transcoding – das kommt in Stufe 3.

**nginx 502**
- Node-Dienst ist nicht gestartet: `sudo systemctl status moviebox`.

**Metadaten-Worker scheint zu hängen**
- `curl .../api/admin/status -H "Authorization: Bearer DEIN_API_TOKEN"` zeigt, wie viele Jobs `queued`, `running` oder `failed` sind. Logs: `sudo journalctl -u moviebox -f`.

## 7. Was du im Web und in der App machen kannst

**Suche** – in der web-oberfläche oben in der mitte, in der app oben über das lupen-icon. Durchsucht deine lokale bibliothek nach titel.

**Upload** – zieh die videodatei einfach ins browserfenster (ganzflächig drag&drop) oder klick oben rechts auf **⬆**. Die datei landet im medienordner, der scanner holt sie sofort rein – nach ein paar sekunden siehst du sie in der bibliothek.

**Video per URL holen** – klick auf **+** oben rechts (web und app). Dialog öffnet sich: URL einwerfen (youtube, vimeo, archive.org, direkte .mp4/.mkv-links, …), optional **Prüfen** klicken für titel/dauer/größe-vorschau, modus wählen:
- **Behalten** – landet dauerhaft in der bibliothek
- **Nur einmal schauen** – geht in den `preview/`-ordner, wird nach 48 h automatisch gelöscht. Zum einmaligen streamen gedacht.
Dann **Hinzufügen**. Der downloader läuft im hintergrund, du siehst live den fortschritt (im admin-bereich oder im URL-dialog).

Die haltezeit für preview-dateien steht in `/opt/moviebox/server/.env` als `PREVIEW_KEEP_HOURS=48` – kannst du ändern, dann `sudo systemctl restart moviebox`.

**Entdecken-Tab** – zeigt wöchentliche TMDB-trends und eine suche über TMDB. **Tipp auf einen treffer** → modal „Quellen für …" öffnet sich und sucht parallel bei archive.org (public-domain) und TorrentIO (DHT-magnet-links). Jede quelle hat „Preview" (48 h) oder „Behalten". Torrent-downloads laufen direkt im moviebox-prozess über webtorrent – kein externes qBittorrent nötig.

**Favoriten** – ❤-icon im detail-view toggelt den favoriten-status. Die „Lieblinge"-ansicht erreichst du über das ❤-icon in der topleiste (web).

**Zufall** – 🎲-icon in der topleiste (web) wählt dir einen zufälligen film oder eine zufällige folge aus deiner bibliothek.

**Löschen** – 🗑-button im detail-view. Löscht die videodatei im medienordner und den datenbank-eintrag.

**Admin (⚙ im Web)** – konten anlegen und löschen, status mit job-zahlen (wie viele filme/serien, wie viele im scan, uptime), scan sofort auslösen, server-token rotieren.

**Scan sofort auslösen** – oben rechts auf **↻** in web oder app. Oder per API siehe schritt 2 unten.

## 8. API-Endpunkte (Übersicht)

Alle authentifizierten Endpoints erwarten `Authorization: Bearer <token>` oder bei `<video>`/`<audio>`-Elementen `?token=...` als Query.

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET`  | `/api/health` | Status (frei). |
| `POST` | `/api/login` | Login. |
| `POST` | `/api/invite/accept` | Einladung einlösen. |
| `GET`  | `/api/me` | Eigenes Konto. |
| `POST` | `/api/me/password` | Passwort setzen. |
| `POST` | `/api/me/invite` | Einladungscode für neues Gerät. |
| `GET`  | `/api/home` | „Weiter schauen" + „Neu hinzugefügt". |
| `GET`  | `/api/library/summary` | Zählstände. |
| `GET`  | `/api/movies` | Alle Filme. |
| `GET`  | `/api/movies/:id` | Film-Details. |
| `GET`  | `/api/shows` | Alle Serien. |
| `GET`  | `/api/shows/:id` | Serie mit allen Staffeln & Folgen. |
| `GET`  | `/api/episodes/:id` | Folge-Details. |
| `GET`  | `/api/media/:id/stream` | Stream der Mediendatei. |
| `GET`  | `/api/media/:id/subtitles/:index` | Untertitel-Sidecar. |
| `GET`  | `/api/media/:id/resume` | Fortsetzen-Position. |
| `POST` | `/api/media/:id/resume` | Fortsetzen-Position speichern. |
| `GET`  | `/api/admin/users` | Alle Konten (Admin). |
| `POST` | `/api/admin/users` | Konto anlegen (Admin). |
| `DELETE` | `/api/admin/users/:id` | Konto löschen (Admin). |
| `POST` | `/api/admin/users/:id/password` | Passwort zurücksetzen (Admin). |
| `POST` | `/api/admin/server-token/rotate` | Neues `API_TOKEN` (Admin). |
| `POST` | `/api/admin/scan` | Scan manuell auslösen (Admin). |
| `GET`  | `/api/admin/status` | Server-Status + Job-Zahlen (Admin). |
| `GET`  | `/api/search?q=…` | Lokale Suche (Filme, Serien, Folgen). |
| `GET`  | `/api/discover/search?q=…` | TMDB-Volltextsuche (braucht TMDB-Key). |
| `GET`  | `/api/discover/trending` | TMDB-Trends dieser Woche (braucht TMDB-Key). |
| `POST` | `/api/upload` | Videodatei als Raw-Body hochladen (`X-Filename`-Header mit dem Dateinamen). |
| `POST` | `/api/sources/resolve` | URL prüfen (titel, dauer, größe, ohne download). |
| `POST` | `/api/sources/add` | URL in die download-queue stellen (`{url, mode: "keep"\|"preview"}`). |
| `GET`  | `/api/sources/jobs` | Laufende und letzte URL-downloads mit fortschritt. |
| `DELETE` | `/api/sources/jobs/:id` | Download-job entfernen. |
| `GET`  | `/api/discover/sources?tmdbId=&kind=&title=&year=` | Alle quellen aus archive.org + TorrentIO für einen TMDB-treffer. |
| `POST` | `/api/media/:id/like`, `DELETE /api/media/:id/like` | Favorit setzen/aufheben. |
| `GET`  | `/api/favorites` | Alle favorisierten filme + folgen. |
| `GET`  | `/api/random?kind=movie\|episode\|any` | Zufälligen titel aus der bibliothek. |
| `DELETE` | `/api/media/:id` | Film oder folge löschen (inkl. datei). |
