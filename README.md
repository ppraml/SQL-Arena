# SQL-Arena

SQL-Learning-Game — ein interaktives Lernspiel für Datenbanken & SQL: 7 Welten (Datenbank-Basics, ER-Modell, Normalisierung, Tabellen & Vererbung, SQL-Abfragen, Transaktionen, NoSQL), je mit Quiz-Sprint, Match-Duell bzw. echter SQL-Werkstatt und einem Boss-Level, plus eine gemischte Prüfungsarena am Ende.

Läuft komplett offline im Browser — keine Server, keine Abhängigkeiten. Die SQL-Werkstatt führt echte SQL-Abfragen live gegen eine kleine In-Memory-Datenbank aus (eigene, selbstgebaute SQL-Engine in `src/sqlengine.js`, da kein sql.js/WASM eingebunden ist).

## Spielen

Einfach `index.html` öffnen (lokal im Browser, oder über GitHub Pages, falls aktiviert). Fortschritt (XP, Sterne, Level) wird im `localStorage` des Browsers gespeichert.

## Entwickeln

Die eigentliche Quelle liegt in `src/*.js` / `src/*.css` / `src/*.html`. `build.sh` fügt alles zu der spielbaren `index.html` zusammen:

```
./build.sh
```

### Struktur

- `src/sqlengine.js` — eigene SQL-Engine (Tokenizer, Parser, Evaluator) für SELECT/INSERT/UPDATE/DELETE/CREATE TABLE
- `src/data.js` — Seed-Datenbank, SQL-Aufgabenpool, Quiz-/Match-/Boss-Fragen aller Welten
- `src/engine.js` — Spiel-State, Persistenz, Weltkarte, Navigation, HUD
- `src/stage_quiz.js` / `stage_match.js` / `stage_sql.js` / `stage_exam.js` — die vier Spielmodi
- `src/main.js` — Init
