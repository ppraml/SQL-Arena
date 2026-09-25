/* ============================================================
   Transaktions-Labor — interaktive Schritt-für-Schritt-Simulation
   von Nebenläufigkeitsproblemen (Lost Update, Dirty Read).
   Bonus-Tool, unabhängig vom Fortschrittssystem.
   ============================================================ */
const TX_SCENARIOS = {
  lost: {
    title: 'Lost Update (verlorene Änderung)',
    intro: 'Konto <b>KTO-1</b> hat einen Kontostand von <b>1000&nbsp;€</b>. Zwei Sitzungen (A und B) arbeiten gleichzeitig damit — <b>ohne</b> dass eine auf die andere wartet.',
    start: 1000,
    steps: [
      {who:null, sql:null, note:'Ausgangslage: Kontostand in der Datenbank = <b>1000&nbsp;€</b>.', a:null, b:null, db:1000},
      {who:'A', sql:'BEGIN TRANSACTION;\nSELECT kontostand FROM KONTO WHERE id=1;', note:'Sitzung A startet eine Transaktion und liest den Kontostand: <b>1000&nbsp;€</b>.', a:1000, b:null, db:1000},
      {who:'B', sql:'BEGIN TRANSACTION;\nSELECT kontostand FROM KONTO WHERE id=1;', note:'Gleichzeitig startet Sitzung B ebenfalls eine Transaktion und liest denselben Wert: <b>1000&nbsp;€</b>.', a:1000, b:1000, db:1000},
      {who:'A', sql:'UPDATE KONTO SET kontostand = 1000 - 200\nWHERE id=1;   -- Abhebung', note:'Sitzung A hebt 200&nbsp;€ ab und rechnet lokal: 1000 − 200 = <b>800&nbsp;€</b> (noch nicht gespeichert).', a:800, b:1000, db:1000},
      {who:'A', sql:'COMMIT;', note:'Sitzung A bestätigt (COMMIT). Die Datenbank zeigt jetzt <b>800&nbsp;€</b>.', a:800, b:1000, db:800},
      {who:'B', sql:'UPDATE KONTO SET kontostand = 1000 + 500\nWHERE id=1;   -- Einzahlung', note:'Sitzung B zahlt 500&nbsp;€ ein — rechnet aber mit ihrem <b>alten</b> gelesenen Wert: 1000 + 500 = <b>1500&nbsp;€</b>. Von Sitzung A weiß B nichts!', a:800, b:1500, db:800},
      {who:'B', sql:'COMMIT;', note:'Sitzung B bestätigt (COMMIT). Die Datenbank zeigt jetzt <b>1500&nbsp;€</b> — die Abhebung von A (−200&nbsp;€) ist spurlos verschwunden! ⚠️', a:800, b:1500, db:1500},
    ],
    verdict: 'Richtig wäre <b>1300&nbsp;€</b> gewesen (1000 − 200 + 500). Stattdessen zeigt die Datenbank 1500&nbsp;€ — Sitzung B hat auf einem veralteten Wert aufgebaut und Sitzung A\'s Änderung überschrieben. Das ist ein <b>Lost Update</b>.',
    quiz: {
      q: 'Wie hätte man dieses Lost Update verhindern können?',
      o: ['Durch striktere Sperren (Locking) oder eine höhere Isolationsstufe, sodass B erst nach dem COMMIT von A lesen/schreiben darf', 'Indem man COMMIT ganz weglässt', 'Indem beide Sitzungen denselben Tabellennamen benutzen', 'Das lässt sich grundsätzlich nicht verhindern'],
      c: 0,
      e: 'Mit Locking (z.B. SELECT ... FOR UPDATE) oder einer höheren Isolationsstufe (z.B. SERIALIZABLE) hätte B warten müssen, bis A fertig ist — und dann mit dem aktuellen Stand (800&nbsp;€) weitergerechnet.'
    }
  },
  dirty: {
    title: 'Dirty Read (Lesen ungültiger Daten)',
    intro: 'Konto <b>KTO-2</b> hat einen Kontostand von <b>500&nbsp;€</b>. Sitzung A ändert etwas, entscheidet sich dann aber um.',
    start: 500,
    steps: [
      {who:null, sql:null, note:'Ausgangslage: Kontostand in der Datenbank = <b>500&nbsp;€</b>.', a:null, b:null, db:500},
      {who:'A', sql:'BEGIN TRANSACTION;\nUPDATE KONTO SET kontostand = 500 + 1000\nWHERE id=2;   -- noch nicht committed!', note:'Sitzung A schreibt (noch ohne COMMIT!) einen neuen, <b>nicht bestätigten</b> Wert: <b>1500&nbsp;€</b>.', a:1500, b:null, db:500},
      {who:'B', sql:'SELECT kontostand FROM KONTO WHERE id=2;', note:'Sitzung B liest — bei niedriger Isolationsstufe (READ UNCOMMITTED) sieht B bereits den <b>unbestätigten</b> Wert von A: <b>1500&nbsp;€</b>! ⚠️', a:1500, b:1500, db:500},
      {who:'A', sql:'ROLLBACK;', note:'Sitzung A macht die Änderung rückgängig (ROLLBACK). Die Datenbank bleibt bei <b>500&nbsp;€</b> — B hat also mit Daten gearbeitet, die es nie wirklich gab!', a:500, b:1500, db:500},
    ],
    verdict: 'Sitzung B hat einen Wert (1500&nbsp;€) gelesen, der nie tatsächlich bestätigt wurde — Sitzung A hat ihn per ROLLBACK verworfen. B hat auf Basis von "schmutzigen", ungültigen Daten weitergearbeitet. Das ist ein <b>Dirty Read</b>.',
    quiz: {
      q: 'Welche Isolationsstufe verhindert Dirty Reads zuverlässig?',
      o: ['READ COMMITTED (oder höher) — liest nur bestätigte (committed) Daten', 'READ UNCOMMITTED — liest auch unbestätigte Daten', 'Gar keine, COMMIT ist dafür nicht relevant', 'Nur NoSQL-Datenbanken verhindern das'],
      c: 0,
      e: 'READ UNCOMMITTED erlaubt Dirty Reads ausdrücklich. Ab READ COMMITTED sieht eine Sitzung nur noch Daten, die bereits committed wurden.'
    }
  }
};

const TxLab = {
  render(el){
    const wrap = document.createElement('div');
    wrap.className = 'introwrap txlabwrap';
    el.appendChild(wrap);
    let scenarioKey = 'lost';
    let stepIdx = 0;
    let answered = false;

    function paint(){
      const sc = TX_SCENARIOS[scenarioKey];
      const step = sc.steps[stepIdx];
      const isLast = stepIdx === sc.steps.length - 1;
      wrap.innerHTML = `
        <button class="backlnk" id="back">← Weltkarte</button>
        <div class="introcard g-warn txlabcard">
          <span class="wicon big">🧪</span>
          <p class="eyebrow">Bonus · Transaktions-Labor</p>
          <h2>${esc(sc.title)}</h2>
          <p class="txlabintro">${sc.intro}</p>

          <div class="txlabswitch">
            <button class="chip ${scenarioKey==='lost'?'on':''}" data-sc="lost">Lost Update</button>
            <button class="chip ${scenarioKey==='dirty'?'on':''}" data-sc="dirty">Dirty Read</button>
          </div>

          <div class="txlabstage">
            <div class="txsession ${step.who==='A'?'active':''}">
              <div class="txhead">Sitzung A</div>
              <div class="txval">${step.a==null?'—':fmtNum(step.a)+' €'}</div>
            </div>
            <div class="txdb">
              <div class="txhead">Datenbank (gespeichert)</div>
              <div class="txval main">${fmtNum(step.db)} €</div>
            </div>
            <div class="txsession ${step.who==='B'?'active':''}">
              <div class="txhead">Sitzung B</div>
              <div class="txval">${step.b==null?'—':fmtNum(step.b)+' €'}</div>
            </div>
          </div>

          ${step.sql ? `<pre class="txsql">${esc(step.sql)}</pre>` : ''}
          <div class="txnote">${step.note}</div>

          <div class="txlabnav">
            <span class="txstepct">Schritt ${stepIdx+1}/${sc.steps.length}</span>
            ${isLast ? '' : '<button class="btn primary" id="txNext">Weiter →</button>'}
          </div>

          ${isLast ? `<div class="txverdict"><b>Was ist passiert?</b> ${sc.verdict}</div>
            <div class="txquiz" id="txquiz"></div>` : ''}
        </div>
      `;
      wrap.querySelector('#back').onclick = () => nav(renderMap);
      wrap.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => {
        scenarioKey = b.getAttribute('data-sc');
        stepIdx = 0; answered = false;
        paint();
      });
      const nextBtn = wrap.querySelector('#txNext');
      if(nextBtn) nextBtn.onclick = () => { stepIdx++; paint(); };
      if(isLast) paintQuiz();
    }

    function paintQuiz(){
      const sc = TX_SCENARIOS[scenarioKey];
      const q = sc.quiz;
      const box = wrap.querySelector('#txquiz');
      if(!box) return;
      box.innerHTML = `<p class="txqtext">${esc(q.q)}</p>` +
        q.o.map((opt,i) => `<button class="opt" data-i="${i}">${esc(opt)}</button>`).join('') +
        `<div class="txqfeedback"></div>`;
      box.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if(answered) return;
        answered = true;
        const i = +b.getAttribute('data-i');
        const ok = i === q.c;
        box.querySelectorAll('.opt').forEach((o,oi) => {
          o.classList.add(oi===q.c ? 'correct' : (oi===i ? 'wrong' : 'dim'));
          o.disabled = true;
        });
        box.querySelector('.txqfeedback').innerHTML = `<div class="expl ${ok?'ok':'no'}"><b>${ok?'Richtig!':'Nicht ganz.'}</b> ${q.e}
          <div class="nextrow"><button class="btn" id="txRetry">🔁 Nochmal</button> <button class="btn primary" id="txDone">Zur Karte →</button></div>
        </div>`;
        if(ok && !S.txlabBonus){ S.txlabBonus = true; addXp(10); addCoins(3); toast('Bonus: +10 XP, +3 🪙', 'ok'); }
        box.querySelector('#txRetry').onclick = () => { stepIdx = 0; answered = false; paint(); };
        box.querySelector('#txDone').onclick = () => nav(renderMap);
      });
    }

    paint();
  }
};
