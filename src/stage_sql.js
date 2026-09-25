/* ============================================================
   Stage: SQL-Werkstatt — echte SQL-Abfragen live ausführen & prüfen
   Kein Leben-Verlust: hier darf man in Ruhe ausprobieren. Hilfe kostet
   nur Münzen, nie den Fortschritt.
   ============================================================ */
const StageSql = (() => {
  function render(el, world, cfg){
    const tasks = cfg.tasks;
    let idx = 0, hintIdx = {}, xpGain = 0, coinGain = 0, hintsUsed = 0, wrongSubs = 0, solutionsShown = {}, attempts = {}, ended = false;

    const wrap = document.createElement('div');
    wrap.className = 'stagewrap sqlwrap g-'+world.color;
    el.appendChild(wrap);

    function schemaHtml(){
      return Object.keys(SEED_DB).map(t => {
        const rows = SEED_DB[t].slice(0,3);
        const cols = Object.keys(SEED_DB[t][0]||{});
        return `<div class="schemat">
          <h5>${t} <span>(${SEED_DB[t].length} Zeilen)</span></h5>
          <div class="tblwrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]===null?'<i>NULL</i>':esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        </div>`;
      }).join('');
    }
    function cheatsheetHtml(){
      return SQL_CHEATSHEET.map(c => `<div class="cheatcard"><h6>${esc(c.t)}</h6><pre>${esc(c.c)}</pre></div>`).join('');
    }

    function paint(){
      const t = tasks[idx];
      hintIdx[t.id] = hintIdx[t.id] || 0;
      attempts[t.id] = attempts[t.id] || 0;
      const hi = hintIdx[t.id];
      const hintsLeft = t.hints.length - hi;
      const nextHintFree = hi === 0;
      wrap.innerHTML = `
        <div class="stagehead">
          <button class="backlnk" id="quit">✕</button>
          <div class="qprog"><i style="width:${Math.round(idx/tasks.length*100)}%"></i></div>
          <div class="attemptct">Aufgabe ${idx+1}/${tasks.length}</div>
        </div>
        ${idx===0 ? `<p class="sqlintro">💛 Kein Herz-Verlust hier — probiere so oft du willst mit <b>▶ Ausführen</b>. Fest hängen? Der <b>Spickzettel</b> und <b>Tipps</b> helfen weiter.</p>` : ''}
        <p class="qcount">${'⭐'.repeat(t.diff)} Schwierigkeit</p>
        <div class="sqltask">${t.prompt}</div>
        <div class="refrow">
          <details class="schemabox"><summary>📋 Tabellen anzeigen</summary><div class="schemas">${schemaHtml()}</div></details>
          <details class="schemabox cheatbox"><summary>📎 SQL-Spickzettel</summary><div class="cheats">${cheatsheetHtml()}</div></details>
        </div>
        <textarea id="sqlin" class="sqlin" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="SELECT ...">${Engine_lastDraft[t.id]||''}</textarea>
        <div class="sqlbtns">
          <button class="btn" id="runBtn">▶ Ausführen</button>
          <button class="btn hintbtn" id="hintBtn" ${hintsLeft<=0?'disabled':''}>💡 Tipp ${hintsLeft<=0?'(alle gezeigt)':(nextHintFree?'(gratis)':'(−4 🪙)')}</button>
          <button class="btn solbtn" id="solBtn">🔓 Lösung zeigen (−8 🪙)</button>
          <button class="btn primary" id="subBtn">✓ Antwort abgeben</button>
        </div>
        <div id="sqlout" class="sqlout"></div>
        <div id="hintout" class="hintout"></div>
      `;
      wrap.querySelector('#quit').onclick = () => nav(el2 => renderStageIntro(el2, world, 'skill'));
      const ta = wrap.querySelector('#sqlin');
      ta.addEventListener('input', () => { Engine_lastDraft[t.id] = ta.value; });
      ta.addEventListener('keydown', (e) => { if((e.ctrlKey||e.metaKey) && e.key==='Enter'){ e.preventDefault(); runQuery(); } });
      wrap.querySelector('#runBtn').onclick = runQuery;
      wrap.querySelector('#subBtn').onclick = submit;
      wrap.querySelector('#hintBtn').onclick = showHint;
      wrap.querySelector('#solBtn').onclick = showSolution;
    }

    function runQuery(){
      const t = tasks[idx];
      const ta = wrap.querySelector('#sqlin');
      const out = wrap.querySelector('#sqlout');
      const sql = ta.value.trim();
      if(!sql){ out.innerHTML = '<p class="sqlmsg warn">Schreib zuerst eine SQL-Abfrage.</p>'; return; }
      const db = SQLEngine.cloneDb(SEED_DB);
      const r = SQLEngine.run(sql, db, {mutate:true});
      if(!r.ok){
        out.innerHTML = `<p class="sqlmsg err">⚠️ Fehler: ${esc(r.error)}</p>`;
        return;
      }
      if(r.type === 'select'){
        out.innerHTML = renderTable(r.columns, r.rows);
      } else {
        out.innerHTML = `<p class="sqlmsg ok">✓ Ausgeführt — ${r.affected} Zeile(n) betroffen.</p>` + renderTable(Object.keys(db[t.table][0]||{}), db[t.table].slice(0,8).map(row=>Object.values(row)));
      }
    }

    function renderTable(cols, rows){
      if(!cols.length) return '<p class="sqlmsg">Kein Ergebnis.</p>';
      const shown = rows.slice(0, 30);
      return `<div class="tblwrap"><table class="restbl"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${shown.length ? shown.map(r=>`<tr>${r.map(v=>`<td>${v===null||v===undefined?'<i>NULL</i>':esc(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}"><i>0 Zeilen</i></td></tr>`}</tbody>
      </table></div><p class="rowcount">${rows.length} Zeile(n)${rows.length>30?' (erste 30 gezeigt)':''}</p>`;
    }

    function showHint(){
      const t = tasks[idx];
      const hi = hintIdx[t.id] || 0;
      if(hi >= t.hints.length) return;
      const free = hi === 0;
      if(!free){
        if(S.coins < 4){ toast('Nicht genug Münzen für einen weiteren Tipp.', 'no'); return; }
        addCoins(-4);
      }
      hintsUsed++;
      hintIdx[t.id] = hi+1;
      const hout = wrap.querySelector('#hintout');
      hout.innerHTML += `<p class="hintline">💡 ${esc(t.hints[hi])}</p>`;
      paint_refreshBtns();
    }

    function showSolution(){
      const t = tasks[idx];
      if(S.coins < 8){ toast('Nicht genug Münzen für die Lösung.', 'no'); return; }
      addCoins(-8);
      solutionsShown[t.id] = true;
      const ta = wrap.querySelector('#sqlin');
      ta.value = t.sol;
      Engine_lastDraft[t.id] = t.sol;
      const hout = wrap.querySelector('#hintout');
      hout.innerHTML += `<p class="hintline solreveal">🔓 Lösung eingefügt — schau sie dir an, dann klick <b>▶ Ausführen</b> und <b>✓ Antwort abgeben</b>, damit sie wirklich hängen bleibt.</p>`;
    }

    function paint_refreshBtns(){
      // Tipp-Button neu bewerten, ohne die ganze Aufgabe neu zu zeichnen (Texteingabe bleibt erhalten)
      const t = tasks[idx];
      const hi = hintIdx[t.id] || 0;
      const hintsLeft = t.hints.length - hi;
      const nextHintFree = hi === 0;
      const btn = wrap.querySelector('#hintBtn');
      if(btn){
        btn.disabled = hintsLeft<=0;
        btn.textContent = '💡 Tipp ' + (hintsLeft<=0?'(alle gezeigt)':(nextHintFree?'(gratis)':'(−4 🪙)'));
      }
    }

    function submit(){
      const t = tasks[idx];
      const ta = wrap.querySelector('#sqlin');
      const out = wrap.querySelector('#sqlout');
      const sql = ta.value.trim();
      if(!sql){ out.innerHTML = '<p class="sqlmsg warn">Schreib zuerst eine SQL-Abfrage.</p>'; return; }
      attempts[t.id] = (attempts[t.id]||0) + 1;
      const userDb = SQLEngine.cloneDb(SEED_DB);
      const userRes = SQLEngine.run(sql, userDb, {mutate:true});
      if(!userRes.ok){
        out.innerHTML = `<p class="sqlmsg err">⚠️ Fehler: ${esc(userRes.error)}</p>`;
        onWrong();
        return;
      }
      const solDb = SQLEngine.cloneDb(SEED_DB);
      const solRes = SQLEngine.run(t.sol, solDb, {mutate:true});
      let ok;
      if(t.type === 'select'){
        out.innerHTML = renderTable(userRes.columns, userRes.rows);
        ok = SQLEngine.compareResults(userRes, solRes, !!t.orderMatters);
      } else if(t.type === 'createview'){
        const checkSql = 'SELECT * FROM ' + t.viewName;
        const uv = SQLEngine.run(checkSql, userDb, {mutate:true});
        const sv = SQLEngine.run(checkSql, solDb, {mutate:true});
        out.innerHTML = uv.ok ? renderTable(uv.columns, uv.rows) : `<p class="sqlmsg err">⚠️ Fehler: ${esc(uv.error)}</p>`;
        ok = !!(uv.ok && sv.ok && SQLEngine.compareResults(uv, sv, false));
      } else if(t.type === 'drop'){
        const gone = !Object.keys(userDb).some(k => k.toUpperCase() === t.table.toUpperCase());
        out.innerHTML = `<p class="sqlmsg">${gone ? 'Tabelle wurde entfernt.' : 'Tabelle existiert noch.'}</p>`;
        ok = gone;
      } else {
        out.innerHTML = `<p class="sqlmsg">${userRes.affected} Zeile(n) betroffen.</p>` + renderTable(Object.keys(userDb[t.table][0]||userDb[t.table]||{}), (userDb[t.table]||[]).slice(0,8).map(r=>Object.values(r)));
        ok = compareTableRows(userDb[t.table], solDb[t.table]);
      }
      noteWeak(world.id, ok);
      const srcW = world.id === 'review' ? (t._srcWorld || world.id) : world.id;
      if(ok) clearMissed('sql', srcW, t.id); else noteMissed('sql', srcW, t.id);
      if(ok) onCorrect(); else onWrong();
    }

    function compareTableRows(a, b){
      if(!a || !b || a.length !== b.length) return false;
      const norm = rows => rows.map(r => JSON.stringify(Object.keys(r).sort().map(k=>[k, typeof r[k]==='number'?Math.round(r[k]*1e6)/1e6:r[k]]))).sort();
      return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
    }

    function onCorrect(){
      const t = tasks[idx];
      const cleanSolve = !solutionsShown[t.id] && (hintIdx[t.id]||0)===0 && (attempts[t.id]||1)<=1;
      xpGain += cleanSolve ? 18 : 12;
      coinGain += 3;
      toast('Richtig! +'+(cleanSolve?18:12)+' XP', 'ok');
      const msg = document.createElement('div');
      msg.className = 'expl ok';
      msg.innerHTML = '<b>Passt!</b> So sieht eine Musterlösung aus: <code>'+esc(t.sol)+'</code>'
        + `<div class="nextrow"><button class="btn primary" id="nextBtn">${idx+1>=tasks.length?'Werkstatt abschließen':'Nächste Aufgabe →'}</button></div>`;
      wrap.appendChild(msg);
      wrap.querySelectorAll('.sqlbtns button').forEach(b => b.disabled = true);
      const nb = msg.querySelector('#nextBtn');
      nb.focus();
      nb.onclick = () => {
        idx++;
        if(idx >= tasks.length){ finish(true); return; }
        paint();
      };
    }
    function onWrong(){
      wrongSubs++;
      toast('Noch nicht ganz — schau dir die Fehlermeldung/Ausgabe an und versuch\'s einfach nochmal. Kostet nichts!', 'no');
      const t = tasks[idx];
      if((attempts[t.id]||0) >= 2){
        const hout = wrap.querySelector('#hintout');
        if(hout && !hout.querySelector('.nudge')){
          hout.innerHTML += `<p class="hintline nudge">🤔 Zwei Versuche schon — vielleicht hilft ein 💡 Tipp oder ein Blick in den 📎 Spickzettel?</p>`;
        }
      }
    }

    function finish(passed){
      ended = true;
      const trouble = hintsUsed + wrongSubs + Object.keys(solutionsShown).length*3;
      const stars = trouble===0 ? 3 : (trouble<=4 ? 2 : 1);
      xpGain += 20;
      completeStage(world.id, 'skill', stars, 100);
      wrap.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'resultcard win';
      card.innerHTML = `
        <div class="confwrap"></div>
        <span class="ricon">⌨️</span>
        <h2>SQL-Werkstatt geschafft!</h2>
        <p>${tasks.length} Aufgaben gelöst · ${hintsUsed} Tipps · ${wrongSubs} Fehlversuche</p>
        ${starsHtml(stars,3)}
        <p class="rewards">+${xpGain} XP · +${coinGain} 🪙</p>
        <div class="rbtns">
          <button class="btn" id="again">Nochmal</button>
          <button class="btn primary" id="toMap">Weiter zur Karte</button>
        </div>
      `;
      wrap.appendChild(card);
      addXp(xpGain); addCoins(coinGain); confettiBurst(card.querySelector('.confwrap'));
      card.querySelector('#again').onclick = () => nav(el2 => render(el2, world, cfg));
      card.querySelector('#toMap').onclick = () => nav(renderMap);
    }

    paint();
    return () => {};
  }
  return {render};
})();
const Engine_lastDraft = {};
