const SQLEngine = require('./sqlengine.js');
const {SEED_DB, SQL_TASKS_W5, SQL_TASKS_W6, QUIZ, BOSS, MATCH, WORLDS} = require('./data.js');

let fail = 0;
function check(name, cond, extra){
  if(!cond){ fail++; console.log('FAIL:', name, extra||''); }
}

// Alle SQL-Musterlösungen müssen fehlerfrei laufen und (bei select) mind. 1 Zeile liefern (sonst wäre die Aufgabe uninteressant), außer explizit erwartet leer.
[...SQL_TASKS_W5, ...SQL_TASKS_W6].forEach(t => {
  const db = SQLEngine.cloneDb(SEED_DB);
  const r = SQLEngine.run(t.sol, db, {mutate:true});
  check(t.id+' solution runs', r.ok, t.id+': '+ (r.error||''));
  if(r.ok && r.type==='select'){
    check(t.id+' has rows', r.rows.length>0, t.id+' rows=0');
  }
  if(r.ok && t.type==='write'){
    check(t.id+' affected>0', r.affected>0, t.id+' affected=0');
  }
  if(r.ok && t.type==='createview'){
    const rv = SQLEngine.run('SELECT * FROM '+t.viewName, db, {mutate:true});
    check(t.id+' view selectable', rv.ok, t.id+': '+(rv.error||''));
    check(t.id+' view has rows', rv.ok && rv.rows.length>0, t.id+' view rows=0');
  }
  if(r.ok && t.type==='drop'){
    check(t.id+' table gone after drop', !Object.keys(db).some(k=>k.toUpperCase()===t.table.toUpperCase()), t.id);
  }
});

// Selbsttest: Lösung gegen sich selbst muss "richtig" gewertet werden
[...SQL_TASKS_W5, ...SQL_TASKS_W6].forEach(t => {
  const db1 = SQLEngine.cloneDb(SEED_DB);
  const r1 = SQLEngine.run(t.sol, db1, {mutate:true});
  const db2 = SQLEngine.cloneDb(SEED_DB);
  const r2 = SQLEngine.run(t.sol, db2, {mutate:true});
  if(t.type==='select'){
    check(t.id+' self-compare select', SQLEngine.compareResults(r1, r2, !!t.orderMatters), t.id);
  } else if(t.type==='createview'){
    const v1 = SQLEngine.run('SELECT * FROM '+t.viewName, db1, {mutate:true});
    const v2 = SQLEngine.run('SELECT * FROM '+t.viewName, db2, {mutate:true});
    check(t.id+' self-compare view', v1.ok && v2.ok && SQLEngine.compareResults(v1, v2, false), t.id);
  } else if(t.type==='drop'){
    check(t.id+' self-compare drop', !Object.keys(db1).some(k=>k.toUpperCase()===t.table.toUpperCase()) && !Object.keys(db2).some(k=>k.toUpperCase()===t.table.toUpperCase()), t.id);
  } else {
    // Vergleiche Zieltabelle
    const tbl1 = JSON.stringify(db1[t.table].map(r=>JSON.stringify(Object.entries(r).sort())).sort());
    const tbl2 = JSON.stringify(db2[t.table].map(r=>JSON.stringify(Object.entries(r).sort())).sort());
    check(t.id+' self-compare write', tbl1 === tbl2, t.id);
  }
});

// Quiz-Konsistenz: jede Frage hat genau 4 Optionen, c ist gültiger Index, e vorhanden
for(const w in QUIZ){
  QUIZ[w].forEach((q,i) => {
    check('quiz '+w+'#'+i+' 4 options', q.o.length===4, JSON.stringify(q));
    check('quiz '+w+'#'+i+' valid c', q.c>=0 && q.c<4, JSON.stringify(q));
    check('quiz '+w+'#'+i+' has expl', !!q.e, JSON.stringify(q));
  });
}
for(const w in BOSS){
  BOSS[w].forEach((q,i) => {
    check('boss '+w+'#'+i+' 4 options', q.o.length===4, JSON.stringify(q));
    check('boss '+w+'#'+i+' valid c', q.c>=0 && q.c<4, JSON.stringify(q));
  });
}
for(const w in MATCH){
  check('match '+w+' has pairs', MATCH[w].length>=6, w);
  const setA = new Set(MATCH[w].map(p=>p.a));
  check('match '+w+' unique a', setA.size===MATCH[w].length, w);
}

// Welten: jede Welt mit skillType 'sql' hat SQL-Aufgaben verfügbar (indirekt über Namenskonvention w5/w6)
check('w5 has sql tasks', SQL_TASKS_W5.length>=8);
check('w6 has sql tasks', SQL_TASKS_W6.length>=5);
WORLDS.forEach(w => {
  check(w.id+' has quiz pool', QUIZ[w.id] && QUIZ[w.id].length>=8, w.id);
  check(w.id+' has boss pool', BOSS[w.id] && BOSS[w.id].length>=5, w.id);
  if(w.skillType==='match') check(w.id+' has match pool', MATCH[w.id] && MATCH[w.id].length>=6, w.id);
});

console.log(fail===0 ? 'ALLE CONTENT-TESTS OK' : (fail+' FEHLER'));
process.exit(fail?1:0);
