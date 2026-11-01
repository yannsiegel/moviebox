# MovieBox

Ein privater Streamingdienst für Filme und Serien. Der Server scannt lokale Ordner, holt die Metadaten (Titel, Poster, Besetzung, Episodenlisten) von **TMDB**, speichert alles in **MongoDB** und streamt an eine eigene **Kotlin-Android-App** sowie einen schlanken **Web-Player**.

Als Vorbild dient [TuneBox](https://github.com/yannsiegel/tunebox) – der Grundaufbau (eigene Konten pro Nutzer, nginx + X-Accel-Redirect, systemd, tägliche Backups) ist derselbe.

```
 Android-App ──HTTPS──▶ nginx ──▶ Node.js (Port 3200) ──▶ MongoDB
 Web-Player  ──┘
 (Compose + Media3)       │              │
                          │              └─▶ ffmpeg + yt-dlp ──▶ /srv/moviebox/media
                          └──── liefert Videodateien direkt aus (X-Accel-Redirect)
```

> ⚠️ **Status:** Diese erste Version enthält nur das Grundgerüst (Server, Konten, Anmeldung, Backups, Installation). Bibliothek, Metadaten-Abgleich, Player und Android-App kommen in den nächsten Ausbaustufen.

## Ausbaustufen

- **Stufe 1 – Grundgerüst (dieser Commit):** Server mit Konten, Tokens, Einladungen, Backups, nginx + HTTPS, systemd, Install-Skript, minimaler Web-Login.
- **Stufe 2 – Bibliothek:** Ordner-Scanner (lokale Dateien), ffprobe-Metadaten, TMDB-Matching, einfacher Web-Player mit Direct-Play, erste Android-App.
- **Stufe 3 – Komfort:** Untertitel, Fortsetzen-Position, nächste Folge, Thumbnail-Vorschau beim Seeken.
- **Stufe 4 – Transcoding + Fernzugriff:** ffmpeg-Transcoding (CPU, 1080p-Ceiling), HLS, Bandbreiten-Stufen, Fernzugriff über nginx + HTTPS.
- **Stufe 5 – Automatische Quellen:** yt-dlp-Downloads, Serien-Abos.
- **Stufe 6 – Analyse + Entdecken:** Lautheits-Angleichung, Intro-Skip, Empfehlungen, Jahresrückblick.
- **Stufe 7 – Offline + Chromecast:** Downloads in der Android-App, Chromecast-Sender.

## Techstack

- **Server:** Node.js ≥ 20.6 (ESM, `--env-file`), Express, offizieller MongoDB-Treiber. Externe Programme: `ffmpeg`/`ffprobe` (Metadaten, Lautheit, Thumbnails, Transcoding), `yt-dlp` (ab Stufe 5).
- **Betrieb:** systemd-Dienst, nginx als Reverse Proxy mit X-Accel-Redirect für Videodateien, certbot für HTTPS. Tägliche Backups der Datenbank pro Konto.
- **Android-App (ab Stufe 2):** Kotlin, Jetpack Compose (Material 3), Media3 (ExoPlayer + MediaSessionService).
- **Web-Player:** HTML/CSS/JS ohne Framework und ohne Build-Schritt, mit strikter Content-Security-Policy.

## Server-Architektur (bereits portiert)

- `config` – alle Einstellungen aus `.env`.
- `db` + `tenant` – pro Konto eigene Collections (Präfix) in einer Datenbank; zentrale Collections für Konten, Tokens, Einladungen. Jede Anfrage läuft per `AsyncLocalStorage` im Kontext des Kontos.
- `users` – Rollen (admin/user), Passwörter (scrypt), Geräte-Tokens (nur gehasht gespeichert), einmalige Einladungslinks.
- `routes` – REST-API unter `/api`, Bearer-Token, `requireAdmin` für Admin-Routen, deutsche Fehlermeldungen.
- `maintenance` – tägliche Backups der Nutzer-Collections.
- `failures` – Fehler-Gruppen für Downloads/Scans (wird in Stufe 2+ befüllt).

## Installation

Dauer: etwa 10 Minuten.

### Was du brauchst

- einen Ubuntu-Server mit Node.js (ab 20.6), MongoDB und nginx
- **empfohlen:** eine (Sub-)Domain wie `movies.deine-domain.de`, deren DNS-Eintrag auf die IP des Servers zeigt. Dann richtet das Installationsskript automatisch kostenloses HTTPS ein. Ohne Domain läuft MovieBox über `http://<Server-IP>:8096`.

### Dateien auf den Server bringen

```sh
git clone https://github.com/yannsiegel/moviebox.git
cd moviebox
sudo ./install.sh
```

Das Skript fragt beim ersten Mal nach Domain, E-Mail (für HTTPS) und MongoDB-Adresse, legt einen Dienst-Benutzer `moviebox` an, kopiert den Server-Code nach `/opt/moviebox`, legt die Mediendaten unter `/srv/moviebox/media` ab und startet den systemd-Dienst `moviebox`.

### Danach

Das Admin-Token (für die API und den Web-Player) wird am Ende der Installation einmal ausgegeben. Weitere Konten legst du nach der Anmeldung über die Admin-Endpunkte an.

### Update

```sh
cd moviebox
git pull
sudo ./install.sh
```

Das Skript erkennt die bestehende Installation an der vorhandenen `.env`, übernimmt alle Einstellungen und startet nur den Dienst neu.

## Lizenz & Hinweise

Privatprojekt, Nutzung auf eigene Verantwortung. Für die rechtlichen Rahmenbedingungen gilt dasselbe wie bei TuneBox: Das System ist dafür gedacht, deine eigenen Mediendateien oder frei verfügbare Inhalte zu streamen.
