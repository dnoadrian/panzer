# Panzer

Battle Royale mit Panzern im Kritzel-Stil, aus der Vogelperspektive.

- Freunde per Name hinzufügen, in die Party einladen (bis 4), zusammen als Team spielen
- Matchmaking füllt mit Bots auf (12 Panzer, bei 4er-Teams 16)
- Zone schrumpft in 5 Stufen, das letzte Team gewinnt
- Berge sind befahrbar: oben bist du vor Schüssen von unten geschützt
- In Büschen ist man unsichtbar; um hineinzutreffen, muss der Busch erst zerschossen werden
- Kisten: Reparatur, Schnellfeuer, Tempo, Kanone+, Doppelschuss
- Level, XP und Lackierungen im Spind (im Browser gespeichert)

## Lokal starten
```
npm install
npm start
```
http://localhost:3000 öffnen. Mehrere Spieler im selben Browser testen: `http://localhost:3000/?profil=2`

Zum Testen mit schneller Zone: `PANZER_FAST=1 npm start`

## Render.com
Web Service, Build `npm install`, Start `node server.js`, Plan Free.
Jeder Push auf `main` wird automatisch neu veröffentlicht.
