# Panzer

Battle Royale mit Panzern im Kritzel-Stil, aus der Vogelperspektive.

- Kampfbus fliegt über die Karte – abspringen (Leertaste/Klick), am Fallschirm landen
- Lila Sturm zieht sich in 5 Stufen zusammen, das letzte Team gewinnt (Sieg Royale)
- Freunde per Name hinzufügen, Party einladen (bis 4), als Team spielen; Bots füllen auf (16 Panzer, Squads 20)
- 150 Leben, Heilung bei Eliminierung (+50), Selbstreparatur nach 5 s ohne Schaden
- Blocken mit Shift / E / Rechtsklick (1,2 s, dann 7 s Abklingzeit)
- Berge befahrbar: oben bist du vor Schüssen von unten geschützt
- Büsche verstecken dich – ein Schuss und sie sind weg
- Rang-System (Bronze bis Unreal) mit gezeichneten Abzeichen; Lackierungen im Spind nach Rang

## Lokal starten
```
npm install
npm start
```
http://localhost:3000 – weiteres Profil im selben Browser: `?profil=2`. Schneller Test: `PANZER_FAST=1 npm start`

## Render.com
Web Service, Build `npm install`, Start `node server.js`. Jeder Push auf `main` wird automatisch veröffentlicht.
