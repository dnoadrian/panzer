# Panzer

Battle Royale mit Panzern im Kritzel-Stil, aus der Vogelperspektive.

- Gespielt wird auf einer Bergkuppe über den Wolken – wer über die Klippe fährt, stürzt ab
- Kampfbus fliegt über die Kuppe – abspringen (Leertaste/Klick), am Fallschirm landen
- Lila Sturm zieht sich in 5 Stufen zusammen (ca. 1:30), das letzte Team gewinnt (Sieg Royale)
- Große Karte mit M, Einstellungen (Esc / Lobby-Tab): Empfindlichkeit, Tasten, Ton, Grafik, Fadenkreuz, Konto löschen
- Freunde per Name hinzufügen, Party einladen (bis 4), als Team spielen; Bots füllen auf (8 Panzer pro Runde)
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
