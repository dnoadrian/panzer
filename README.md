# Panzer

Battle Royale mit Panzern im Papier-Look (wie Paper Mario), aus der Vogelperspektive.

## Spielen
- **Kampfbus** über die Bergkuppe → abspringen (Leertaste/Klick), am Fallschirm landen. Klippe = Absturz!
- **Lila Sturm**, 5 Stufen, Runde ca. 4 Minuten. 10 Spieler (Squad 12), Bots füllen auf.
- **Modi** Solo / Duo / Squad, **Auffüllen** an/aus. Wer gleichzeitig sucht, landet im selben Spiel.
- 150 Leben, +50 Leben pro Eliminierung, Selbstreparatur nach 5 s ohne Schaden. Blocken mit Shift.
- **19 Fähigkeiten** (Taste F) – vom Turbo bis „Übermacht“ (Unreal). Wallhack + Aimbot gibt es nur für die drei besten Unreal-Spieler.
- **Ränge** Bronze I bis Unreal mit Abzeichen, **Zahnräder** als Münzen, **täglicher Shop** (Leuchtspur, Lackierung, Hut, Kill-Finisher).
- Freunde per Name (auch offline), Party bis 4, Lobby-Nachrichten, Einstellungen (Esc), große Karte (M), Vollbild.

## Admin-Panel
In der Lobby Taste **0** → Benutzer `adrian`, Passwort `1234`.
Bitte auf Render ein eigenes Passwort setzen: Umgebungsvariable `ADMIN_PASS` (und optional `ADMIN_USER`).

## Konten dauerhaft speichern (wichtig für Render)
Ohne Datenbank speichert der Server in `data/db.json`. Auf Render (kostenlos) wird diese Datei
bei jedem Neustart/Deploy gelöscht → Konten, Ränge und Münzen wären weg.
Lösung: eine Postgres-Datenbank anlegen (z. B. kostenlos bei neon.tech oder bei Render) und
deren Verbindungs-URL als Umgebungsvariable `DATABASE_URL` im Render-Dienst eintragen.

## Lokal starten
```
npm install
npm start
```
http://localhost:3000 · weiteres Profil im selben Browser: `?profil=2` · schneller Test: `PANZER_FAST=1 MM_WAIT=2 npm start`
