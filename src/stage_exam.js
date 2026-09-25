/* ============================================================
   Finale: Prüfungsarena — gemischter, zeitbasierter Prüfungssimulator
   ============================================================ */
function renderExamIntro(el){
  const wrap = document.createElement('div');
  wrap.className = 'introwrap';
  wrap.innerHTML = `
    <button class="backlnk" id="back">← Weltkarte</button>
    <div class="introcard g-warn">
      <span class="wicon big">🏆</span>
      <p class="eyebrow">Finale</p>
      <h2>Prüfungsarena</h2>
      <p>Gemischte Fragen aus allen 7 Welten, plus echte SQL-Aufgaben. Kein Herz-Limit — wie bei der echten Prüfung beantwortest du einfach alles, was kommt, und siehst am Ende deine Schwachstellen.</p>
      <div class="examchoices">
        <button class="btn primary big" id="short">Kurzcheck — 15 Fragen</button>
        <button class="btn big" id="full">Volltest — 25 Fragen</button>
      </div>
    </div>
  `;
  el.appendChild(wrap);
  wrap.querySelector('#back').onclick = () => nav(renderMap);
  wrap.querySelector('#short').onclick = () => nav(el2 => StageExam.render(el2, 15));
  wrap.querySelector('#full').onclick = () => nav(el2 => StageExam.render(el2, 25));
}

const StageExam = (() => {
  function buildPool(n){
    const quizItems = [];
    WORLDS.forEach(w => {
      QUIZ[w.id].forEach(q => quizItems.push({type:'quiz', w:w.id, q}));
      BOSS[w.id].forEach(q => quizItems.push({type:'quiz', w:w.id, q}));
    });
    const sqlItems = [];
    SQL_TASKS_W5.forEach(t => sqlItems.push({type:'sql', w:'w5', task:t}));
    SQL_TASKS_W6.forEach(t => sqlItems.push({type:'sql', w:'w6', task:t}));
    const sqlCount = n >= 25 ? 4 : 2;
    const chosenSql = pick(sqlItems, sqlCount);
    const chosenQuiz = pick(quizItems, n - chosenSql.length);
    return shuffle([...chosenQuiz, ...chosenSql]);
  }

  function render(el, n){
    const items = buildPool(n);
    let idx = 0, correct = 0, xpGain = 0, byWorld = {};
    WORLDS.forEach(w => byWorld[w.id] = {ok:0, total:0});

    const wrap = document.createElement('div');
    wrap.className = 'stagewrap examwrap g-warn';
    el.appendChild(wrap);
    let timer = null, timeLeft = 0;

    function clearTimer(){ if(timer){ clearInterval(timer); timer=null; } }

    function paint(){
      const it = items[idx];
      wrap.innerHTML = `
        <div class="stagehead">
          <button class="backlnk" id="quit">✕</button>
          <div class="qprog"><i style="width:${Math.round(idx/items.length*100)}%"></i></div>
          <div class="examn">Frage ${idx+1}/${items.length}</div>
        </div>
      `;
      wrap.querySelector('#quit').onclick = () => { clearTimer(); nav(renderMap); };
      if(it.type === 'quiz') paintQuiz(it);
      else paintSql(it);
    }

    function paintQuiz(it){
      const q = it.q;
      const order = shuffle(q.o.map((_,i)=>i));
      const opts = order.map(i=>q.o[i]);
      const cIdx = order.indexOf(q.c);
      timeLeft = 32;
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="timerbar"><i id="tbar" style="width:100%"></i></div>
        <h3 class="qtext">${esc(q.q)}</h3>
        <div class="opts">${opts.map((o,i)=>`<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}</div>
      `;
      wrap.appendChild(body);
      let answered = false;
      body.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
        if(answered) return; answered = true; clearTimer();
        const i = parseInt(b.getAttribute('data-i'),10);
        const ok = i === cIdx;
        body.querySelectorAll('.opt').forEach((bb,bi) => { bb.disabled = true; if(bi===cIdx) bb.classList.add('correct'); else if(bi===i) bb.classList.add('wrong'); });
        registerAnswer(it.w, ok, q.e);
      }));
      timer = setInterval(() => {
        timeLeft -= 0.1;
        const b = body.querySelector('#tbar');
        if(b) b.style.width = Math.max(0, timeLeft/32*100)+'%';
        if(timeLeft<=0 && !answered){ answered = true; clearTimer();
          body.querySelectorAll('.opt').forEach((bb,bi) => { bb.disabled = true; if(bi===cIdx) bb.classList.add('correct'); });
          registerAnswer(it.w, false, q.e);
        }
      }, 100);
    }

    function paintSql(it){
      const t = it.task;
      const body = document.createElement('div');
      body.innerHTML = `
        <p class="qcount">SQL-Aufgabe</p>
        <div class="sqltask">${t.prompt}</div>
        <details class="schemabox"><summary>📋 Tabellen anzeigen</summary><div class="schemas">${schemaHtmlMini()}</div></details>
        <textarea id="sqlin" class="sqlin" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="SELECT ..."></textarea>
        <div class="sqlbtns">
          <button class="btn" id="runBtn">▶ Ausführen</button>
          <button class="btn primary" id="subBtn">✓ Antwort abgeben</button>
          <button class="btn" id="skipBtn">Überspringen</button>
        </div>
        <div id="sqlout" class="sqlout"></div>
      `;
      wrap.appendChild(body);
      body.querySelector('#runBtn').onclick = () => {
        const sql = body.querySelector('#sqlin').value.trim();
        const db = SQLEngine.cloneDb(SEED_DB);
        const r = SQLEngine.run(sql, db, {mutate:true});
        const out = body.querySelector('#sqlout');
        if(!r.ok){ out.innerHTML = `<p class="sqlmsg err">⚠️ ${esc(r.error)}</p>`; return; }
        if(r.type==='select') out.innerHTML = tableHtml(r.columns, r.rows);
        else out.innerHTML = `<p class="sqlmsg ok">✓ ${r.affected} Zeile(n) betroffen.</p>`;
      };
      body.querySelector('#subBtn').onclick = () => {
        const sql = body.querySelector('#sqlin').value.trim();
        const userDb = SQLEngine.cloneDb(SEED_DB);
        const ur = SQLEngine.run(sql, userDb, {mutate:true});
        let ok = false;
        if(ur.ok){
          const solDb = SQLEngine.cloneDb(SEED_DB);
          const sr = SQLEngine.run(t.sol, solDb, {mutate:true});
          if(t.type==='select'){
            ok = SQLEngine.compareResults(ur, sr, !!t.orderMatters);
          } else if(t.type==='createview'){
            const uv = SQLEngine.run('SELECT * FROM '+t.viewName, userDb, {mutate:true});
            const sv = SQLEngine.run('SELECT * FROM '+t.viewName, solDb, {mutate:true});
            ok = !!(uv.ok && sv.ok && SQLEngine.compareResults(uv, sv, false));
          } else if(t.type==='drop'){
            ok = !Object.keys(userDb).some(k => k.toUpperCase() === t.table.toUpperCase());
          } else {
            ok = JSON.stringify((userDb[t.table]||[]).map(r=>JSON.stringify(Object.entries(r).sort())).sort()) === JSON.stringify((solDb[t.table]||[]).map(r=>JSON.stringify(Object.entries(r).sort())).sort());
          }
        }
        registerAnswer(it.w, ok, 'Musterlösung: '+t.sol);
      };
      body.querySelector('#skipBtn').onclick = () => registerAnswer(it.w, false, 'Übersprungen. Musterlösung: '+t.sol);
    }

    function schemaHtmlMini(){
      return Object.keys(SEED_DB).map(t => {
        const rows = SEED_DB[t].slice(0,2);
        const cols = Object.keys(SEED_DB[t][0]||{});
        return `<div class="schemat"><h5>${t}</h5><div class="tblwrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]===null?'<i>NULL</i>':esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
      }).join('');
    }
    function tableHtml(cols, rows){
      const shown = rows.slice(0,20);
      return `<div class="tblwrap"><table class="restbl"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${shown.map(r=>`<tr>${r.map(v=>`<td>${v===null?'<i>NULL</i>':esc(v)}</td>`).join('')}</tr>`).join('')||'<tr><td>0 Zeilen</td></tr>'}</tbody></table></div>`;
    }

    function registerAnswer(worldId, ok, expl){
      clearTimer();
      byWorld[worldId].total++;
      if(ok){ byWorld[worldId].ok++; correct++; xpGain += 12; }
      noteWeak(worldId, ok);
      const msg = document.createElement('div');
      msg.className = 'expl ' + (ok?'ok':'no');
      msg.innerHTML = `<b>${ok?'Richtig!':'Nicht ganz.'}</b> ${esc(String(expl||''))}
        <div class="nextrow"><button class="btn primary" id="nextBtn">${idx+1>=items.length?'Ergebnis anzeigen':'Weiter →'}</button></div>`;
      wrap.appendChild(msg);
      const advance = () => {
        idx++;
        wrap.innerHTML = '';
        if(idx >= items.length){ finish(); return; }
        paint();
      };
      const nb = wrap.querySelector('#nextBtn');
      nb.focus();
      nb.onclick = advance;
    }

    function finish(){
      const pct = Math.round(correct/items.length*100);
      if(S.examBest===null || pct > S.examBest){ S.examBest = pct; saveState(); }
      addXp(xpGain);
      wrap.innerHTML = '';
      const weakWorlds = WORLDS.filter(w => byWorld[w.id].total>0 && (byWorld[w.id].ok/byWorld[w.id].total) < 0.7);
      const card = document.createElement('div');
      card.className = 'resultcard exam ' + (pct>=70?'win':'lose');
      card.innerHTML = `
        <div class="confwrap"></div>
        <span class="ricon">${pct>=70?'🏆':'📚'}</span>
        <h2>${pct}% erreicht</h2>
        <p>${correct} von ${items.length} richtig · +${xpGain} XP</p>
        <div class="worldbars">
          ${WORLDS.map(w => {
            const d = byWorld[w.id];
            const p = d.total ? Math.round(d.ok/d.total*100) : null;
            return `<div class="wbar"><span class="wblabel">${w.icon} ${esc(w.title)}</span><div class="wbtrack"><i style="width:${p===null?0:p}%" class="${p!==null&&p<70?'low':''}"></i></div><span class="wbpct">${p===null?'–':p+'%'}</span></div>`;
          }).join('')}
        </div>
        ${weakWorlds.length ? `<p class="weaktip">🎯 Noch üben: ${weakWorlds.map(w=>esc(w.title)).join(', ')}</p>` : `<p class="weaktip ok">Stark in allen Themen — weiter so!</p>`}
        <div class="rbtns">
          <button class="btn" id="again">Neuer Versuch</button>
          <button class="btn primary" id="toMap">Zur Karte</button>
        </div>
      `;
      wrap.appendChild(card);
      if(pct>=70) confettiBurst(card.querySelector('.confwrap'));
      card.querySelector('#again').onclick = () => nav(renderExamIntro);
      card.querySelector('#toMap').onclick = () => nav(renderMap);
    }

    paint();
    return () => clearTimer();
  }
  return {render};
})();
