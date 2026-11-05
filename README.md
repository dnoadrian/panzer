# Panzer-Kritzel 🖍️

Panzer-Spiel im Kritzel-Stil aus der Vogelperspektive – bis zu 4 Spieler (Freunde und/oder Bots).

## So funktioniert's
1. Seite öffnen → **Namen wählen**
2. In der Lobby siehst du rechts, wer **online** ist → **Einladen** klicken
3. Dein Freund bekommt ein Popup → **Annehmen**
4. Freie Plätze mit **+ Bot** füllen (oder leer lassen)
5. Der Chef 👑 klickt **Spiel starten** – wer zuerst 10 Treffer hat, gewinnt

**Steuerung:** WASD/Pfeile fahren · Maus zielen · Klick/Leertaste schießen
**Karte:** Berge (blocken, Kugeln prallen ab) · Büsche (verstecken dich) · Teleporter (gleiche Farbe = verbunden)
**Powerups:** F = Feuer (schnell schießen) · S = Schild · T = Tempo

## Lokal starten
```
npm install
npm start
```
Dann http://localhost:3000 öffnen (mehrere Tabs = mehrere Spieler zum Testen).

## Auf Render.com hochladen
1. Diesen Ordner in ein **GitHub-Repository** hochladen (ohne `node_modules`).
2. Auf https://render.com einloggen → **New +** → **Web Service** → dein Repository auswählen.
3. Einstellungen:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. **Create Web Service** – nach 1–2 Minuten bekommst du eine Adresse wie `https://panzer-kritzel.onrender.com`.
5. Den Link an deine Freunde schicken – alle öffnen ihn, wählen einen Namen, und du lädst sie ein.

Hinweis: Der kostenlose Render-Plan schläft nach ca. 15 Minuten ohne Besucher ein. Beim ersten Öffnen danach dauert es bis zu einer Minute, bis die Seite lädt – einfach kurz warten.
