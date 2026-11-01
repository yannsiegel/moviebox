# MovieBox

Ein privater Streamingdienst für Filme und Serien. Der Server scannt lokale Ordner, holt die Metadaten (Titel, Poster, Besetzung, Episodenlisten) von **TMDB**, speichert alles in **MongoDB** und streamt an eine eigene **Kotlin-Android-App** sowie einen schlanken **Web-Player**.

Als Vorbild dient [TuneBox](https://github.com/yannsiegel/tunebox) – der Grundaufbau (eigene Konten pro Nutzer, nginx + X-Accel-Redirect, systemd, tägliche Backups) ist derselbe.

```
 Android-App ──HTTPS──▶ nginx ──▶ Node.js (Port 3200) ──▶ MongoDB
 Web-Player  ──┘
 (Compose + Media3)       │              │
                          │              └─▶ ffmpeg + TMDB ──▶ /srv/moviebox/media
                          └──── liefert Videodateien direkt aus (X-Accel-Redirect)
```

## Funktionen (Stufe 2 – aktueller Stand)

- **Ordner-Scanner**: Legt du eine Videodatei nach `/srv/moviebox/media/`, taucht sie innerhalb weniger Minuten in der Bibliothek auf. Umbenennen oder Löschen wirkt genauso.
- **Automatische Metadaten** von TMDB: Poster, Backdrops, Beschreibungen, Originaltitel, Veröffentlichungsjahr, Genres, Episoden-Titel und -Bilder. Ohne TMDB-Key funktioniert die Bibliothek weiter – nur mit Datei-Namen als Titel.
- **Serien-Erkennung** aus Dateinamen: `S01E02`, `1x02`, Ordnerstruktur `Serie/Season 1/02 - Titel.mkv`.
- **Direct-Play** über HTML5 `<video>` bzw. ExoPlayer: der Server reicht die Datei durch, keine Umkodierung nötig solange der Client das Format kann (fast immer bei MP4/MKV/H.264/H.265).
- **Fortsetzen-Position** wird alle 10 Sekunden synchron zwischen Web und App gehalten.
- **„Weiter schauen"** und **„Neu hinzugefügt"** auf der Startseite.
- **Untertitel-Sidecars** (`.srt`, `.ass`, `.vtt` neben der Videodatei) werden erkannt und mitgeliefert.
- **Mehrere Konten** auf einem Server, Admin-Bereich, Einladungslinks, tägliche Backups.
- **Android-App** (Kotlin + Compose + Media3, APK als GitHub-Release) mit Login, Bibliothek, Detailansicht, Player.
- **Web-Player** im Browser mit Grid, Detail, Full-Screen-Video.

## Ausbaustufen

- ✅ **Stufe 1 – Grundgerüst:** Server, Konten, Tokens, Einladungen, Backups, Installation.
- ✅ **Stufe 2 – Bibliothek (hier):** Scanner, ffprobe, TMDB-Matching, Serien-/Film-Endpoints, Fortsetzen, Untertitel-Sidecars, echter Web-Player, Android-App-Skelett, GitHub-Workflow für APK.
- **Stufe 3 – Transcoding + Komfort:** CPU-Transcoding mit ffmpeg (1080p-Ceiling, HLS), Thumbnail-Sprite-Sheets für Seek-Vorschau, Hardware-Untertitel.
- **Stufe 4 – Automatische Quellen:** yt-dlp-Integration (wie TuneBox), Serien-Abos.
- **Stufe 5 – Analyse + Entdecken:** Intro-Skip, Lautheits-Angleichung, Empfehlungen, Jahresrückblick.
- **Stufe 6 – Offline + Chromecast:** Downloads in der Android-App (Media3-Download-Cache), Chromecast-Sender.

## Techstack

- **Server:** Node.js ≥ 20.6 (ESM, `--env-file`), Express, offizieller MongoDB-Treiber. Externe Programme: `ffmpeg`/`ffprobe`. Nur zwei npm-Deps.
- **Betrieb:** systemd-Dienst, nginx als Reverse Proxy mit X-Accel-Redirect für Videodateien, certbot für HTTPS. Tägliche Backups der Datenbank pro Konto.
- **Android-App:** Kotlin, Jetpack Compose (Material 3), Media3 (ExoPlayer + MediaSessionService). Retrofit + kotlinx.serialization + Coil.
- **Web-Player:** HTML/CSS/JS ohne Framework und ohne Build-Schritt, mit strikter Content-Security-Policy.

## Installation

Siehe **[ANLEITUNG.md](ANLEITUNG.md)** für die Schritt-für-Schritt-Installation inkl. Updates, erste Mediendateien einlegen, TMDB-Key einrichten und App installieren.

Kurz:

```sh
cd /root && git clone https://github.com/yannsiegel/moviebox.git
cd moviebox && sudo bash install.sh
```

Beim Update (bei vorhandener Installation):

```sh
cd /root/moviebox && git pull && NODE_BIN=/opt/node-v26.13.0/bin/node bash install.sh
```

Die Android-APK wird nach jedem Push nach `app/` automatisch durch GitHub Actions gebaut und als Release unter https://github.com/yannsiegel/moviebox/releases veröffentlicht.
