# PANZER – Große Liste & Plan

Alles, was du dir gewünscht hast, als Liste. Spätere Wünsche ersetzen frühere
(z. B. erst 6, dann 8, dann **10 Spieler**; erst 1:30, dann 120 s, dann **4 Minuten**).

## A. Grundlage: Datenbank & Konten
1. Server speichert alle Konten dauerhaft (Name, Rang, Münzen, gekaufte Items, Ausrüstung, Fähigkeit, Freunde, Anfragen, Statistik).
   - Speicher: Postgres über `DATABASE_URL` (für Render), sonst Datei `data/db.json` (lokal).
2. Name vergeben → Fehlermeldung, anderen wählen (gilt für **alle** Konten, auch offline; Groß/klein egal).
3. Konto löschen → Name sofort wieder frei.
4. **Freundschaftsanfragen auch an Offline-Spieler** (werden gespeichert, beim nächsten Login sichtbar).
5. Rang, Münzen & Käufe werden vom Server berechnet (nicht mehr im Browser → nicht schummelbar).

## B. Katalog: Ränge, Fähigkeiten, Münzen, Shop
6. Ranked **schwerer**: mehr Punkte pro Stufe (100 → 500), höherer Einsatz in hohen Rängen, Abstiegsschutz pro Rangstufe.
7. Nach dem Tod/Ende: „**+23 RP · 46 % → Gold II**“ mit animiertem Fortschrittsbalken.
8. **18 Fähigkeiten** – eine pro Rang, Tab „Fähigkeiten“, alle freigeschalteten wählbar (Taste F):
   Turbo · Reparatur · Nebel · Mine · Scharfschütze · Salve · Schutzkuppel · Radar · Blink ·
   Schrotflinte · Rakete (alle 15 s) · Magnetkugeln · Unsichtbar · Abpraller · Lebensraub ·
   Artillerie · EMP · **Wallhack + Aimbot** (Unreal: Hitboxen durch alles sehen, doppelte Gegner-Hitbox, Treffer fliegt 100 % ins Ziel).
9. Normale Kugeln fliegen nicht unendlich weit (Reichweite begrenzt, Scharfschütze weiter).
10. **Münzen** (goldene Zahnrad-Münzen) für Platzierung & Eliminierungen.
11. **Shop**, rotiert jeden Tag, 4 Angebote: Leuchtspur · Panzer-Lackierung · Spezial-Item (Hut/Mütze/Krone …) · Kill-Finisher-Effekt.
12. Spind mit Kategorien; Auswahl ändert sich **sofort**.

## C. Spiel & Server
13. **10 Spieler**, Karte **größer**, Runde bis Sturm zu = **4 Minuten**.
14. Modi **Solo / Duo / Squad**, **Auffüllen an/aus** (wie Fortnite). Echte Spieler, die gleichzeitig suchen, kommen ins selbe Spiel („Spieler gefunden 3/10“).
15. Karte spannender: benannte Orte (Ruine, Windmühle, Holzlager, Teich, Wäldchen), Bäume, Teich (bremst), Mauern, Felsen.
16. **Berge nicht befahrbar** und deutlich bergig (Gipfel mit Schnee); Wiese obendrauf, kleine Details.
17. Teleporter schicken dich **nicht in den Sturm** (Ziel im Sturm → Teleporter aus).
18. Hitbox wieder **kleiner**.
19. Bots: **Zittern fixen**, **schwächer** (ungenauer, langsamer), landen gut verteilt, nutzen Fähigkeiten.
20. Absturz-**Animation** (Panzer kippt und fällt die Klippe hinunter).
21. Admin-Cheats wirken im Spiel (Unverwundbar, keine Abklingzeit, alle Fähigkeiten, Tempo, Ein-Schuss, Wallhack).

## D. Grafik: Paper-Mario-Stil (statt Kritzel)
22. Alle Texturen neu: Papierausschnitte mit weißem Rand und Schatten, kräftige Farben, Papier-Struktur.
    Panzer, Büsche (Partikel wenn jemand drin ist, **keine Beeren**), Berge, Felsen, Bäume, Teich, Ruinen, Klippe, Wolken, Sturm, Kugeln, Effekte, Rang-Abzeichen, Münzen, Lobby, Menüs.
23. „Liebe“: kleine Animationen, Sounds, Details (Blumen, Schmetterlinge, Staub, Rauch bei Schaden …).

## E. Lobby & Menüs
24. Panzerrohre in der Lobby folgen **nicht** mehr dem Mauszeiger.
25. Tabs: Lobby · Spind · Fähigkeiten · Shop · Einstellungen; Münzen oben.
26. **Admin-Panel** (Taste **0**, Benutzer `adrian`, Passwort `1234`): alle Nutzer sehen, einzeln/alle löschen,
    Münzen verteilen, Rang setzen, Cheats an/aus, **Lobby-Nachrichten** mit Anzeigedauer, Serverstatus.
27. **Vollbild-Knopf**; im Vollbild wird Strg+W usw. abgefangen; Warnung beim Schließen während einer Runde.
28. Spielmenü (Esc): Weiter · Einstellungen · Spiel verlassen. FPS so hoch wie möglich (Limit wählbar).

## F. Im Spiel
29. **Wenig Leben spürbar**: roter pulsierender Rand, Herzschlag, Rauch am Panzer.
30. Wenn tot: Mauszeiger frei, alles anklickbar.
31. Minimap = kleine Version der großen Karte (ohne Sichtfeld-Rechteck), große Karte mit M.
32. Fähigkeits-Anzeige mit Abklingzeit, Finisher-Effekte, Leuchtspuren, Hüte sichtbar.

## G. Abschluss
33. Optimieren (keine Zuckler, wenig Speicher), alles testen (Server-Skripte + Browser), pushen.
34. **Offene Frage an dich:** Auf Render (kostenlos) wird die Festplatte bei jedem Neustart gelöscht.
    Damit Konten/Münzen dauerhaft bleiben, braucht es eine Datenbank → siehe README (`DATABASE_URL`).
