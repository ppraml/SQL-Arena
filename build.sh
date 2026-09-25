#!/bin/bash
# Baut src/* zu einer einzigen spielbaren index.html zusammen.
cd "$(dirname "$0")"
OUT=index.html
{
  cat src/head.html
  echo "<style>"
  cat src/theme.css src/game.css
  echo "</style>"
  cat src/body.html
  echo "<script>"
  cat src/sqlengine.js src/data.js src/engine.js src/stage_quiz.js src/stage_match.js src/stage_sql.js src/stage_exam.js src/main.js
  echo "</script>"
} > /tmp/_body.html
{
  echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'
  cat /tmp/_body.html
  echo '</body></html>'
} > $OUT
rm -f /tmp/_body.html
wc -c $OUT
