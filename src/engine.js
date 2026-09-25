/* ============================================================
   SQL-Arena — Engine: Persistenz, State, HUD, Weltkarte, Navigation
   ============================================================ */
const mem = {};
const Store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v===null ? d : JSON.parse(v); }catch(e){ return (k in mem) ? mem[k] : d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} mem[k] = v; },
};

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function pick(arr, n){ return shuffle(arr).slice(0, Math.min(n, arr.length)); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtNum(n){ return (Math.round(n*100)/100).toLocaleString('de-AT'); }

/* ---------- State ---------- */
const DEFAULT_STATE = () => ({
  xp: 0, coins: 0, bestStreak: 0,
  progress: {}, // {w1:{quiz:{done,stars,best}, skill:{...}, boss:{...}}}
  examBest: null,
  weak: {}, // {w1:{ok:0,total:0}}
});

let S = Store.get('sqla:state', null) || DEFAULT_STATE();
function saveState(){ Store.set('sqla:state', S); }
function level(){ return Math.floor(S.xp/120) + 1; }
function xpIntoLevel(){ return S.xp % 120; }
function addXp(n){ S.xp += n; saveState(); renderHud(); }
function addCoins(n){ S.coins = Math.max(0, S.coins + n); saveState(); renderHud(); }
function noteStreak(n){ if(n > S.bestStreak){ S.bestStreak = n; saveState(); } }
function noteWeak(worldId, ok){
  if(!S.weak[worldId]) S.weak[worldId] = {ok:0, total:0};
  S.weak[worldId].total++;
  if(ok) S.weak[worldId].ok++;
  saveState();
}
function stageProg(worldId, stage){
  if(!S.progress[worldId]) S.progress[worldId] = {};
  if(!S.progress[worldId][stage]) S.progress[worldId][stage] = {done:false, stars:0, best:0};
  return S.progress[worldId][stage];
}
function completeStage(worldId, stage, stars, scorePct){
  const p = stageProg(worldId, stage);
  p.done = true;
  p.stars = Math.max(p.stars, stars);
  p.best = Math.max(p.best, scorePct);
  saveState();
}
function isStageUnlocked(worldIdx, stageIdx){
  // stageIdx: 0=quiz,1=skill,2=boss innerhalb einer Welt
  if(worldIdx === 0 && stageIdx === 0) return true;
  const worlds = WORLDS;
  if(stageIdx === 0){
    // erste Stage einer Welt: braucht Boss der Vorwelt (oder Welt 0)
    if(worldIdx === 0) return true;
    const prevWorld = worlds[worldIdx-1];
    return !!(S.progress[prevWorld.id] && S.progress[prevWorld.id].boss && S.progress[prevWorld.id].boss.done);
  }
  const stages = ['quiz','skill','boss'];
  const w = worlds[worldIdx];
  const prevStage = stages[stageIdx-1];
  return !!(S.progress[w.id] && S.progress[w.id][prevStage] && S.progress[w.id][prevStage].done);
}
function isExamUnlocked(){
  const last = WORLDS[WORLDS.length-1];
  return !!(S.progress[last.id] && S.progress[last.id].boss && S.progress[last.id].boss.done);
}
function worldStars(worldId){
  const p = S.progress[worldId];
  if(!p) return 0;
  return (p.quiz?.stars||0) + (p.skill?.stars||0) + (p.boss?.stars||0);
}

/* ---------- Navigation / Screen-Root ---------- */
const root = () => document.getElementById('app');
let currentCleanup = null;
function nav(renderFn){
  if(currentCleanup){ try{ currentCleanup(); }catch(e){} currentCleanup = null; }
  const el = root();
  el.innerHTML = '';
  el.scrollTop = 0;
  window.scrollTo({top:0, behavior:'instant'});
  const cleanup = renderFn(el);
  if(typeof cleanup === 'function') currentCleanup = cleanup;
  renderHud();
}

/* ---------- HUD ---------- */
function renderHud(){
  const hud = document.getElementById('hud');
  if(!hud) return;
  const pct = Math.round((xpIntoLevel()/120)*100);
  hud.innerHTML = `
    <button class="hbrand" id="hudHome" aria-label="Zur Weltkarte">🎮 <span>SQL-<b>Arena</b></span></button>
    <div class="hstat" title="Level"><span class="hlv">Lvl ${level()}</span><span class="hxpbar"><i style="width:${pct}%"></i></span></div>
    <div class="hstat hcoin" title="Münzen">🪙 ${S.coins}</div>
  `;
  const homeBtn = document.getElementById('hudHome');
  if(homeBtn) homeBtn.onclick = () => nav(renderMap);
}

/* ---------- Feedback-Helfer ---------- */
function toast(msg, kind){
  const t = document.createElement('div');
  t.className = 'toast ' + (kind||'');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 1800);
}
function confettiBurst(container){
  const n = 22;
  for(let i=0;i<n;i++){
    const s = document.createElement('span');
    s.className = 'confetti';
    s.style.setProperty('--x', (Math.random()*2-1).toFixed(2));
    s.style.setProperty('--r', (Math.random()*360).toFixed(0)+'deg');
    s.style.setProperty('--d', (0.6+Math.random()*0.6).toFixed(2)+'s');
    s.style.background = ['var(--s)','var(--a)','var(--b)','var(--k)','var(--mk)'][i%5];
    container.appendChild(s);
    setTimeout(()=>s.remove(), 1300);
  }
}
function starsHtml(n, max){
  max = max||3;
  let h = '';
  for(let i=1;i<=max;i++) h += `<span class="star ${i<=n?'on':''}">★</span>`;
  return `<span class="stars">${h}</span>`;
}

/* ---------- Weltkarte (Home) ---------- */
const STAGE_META = {
  quiz: {label:'Quiz-Sprint', icon:'⚡', desc:'Schnelle Multiple-Choice-Runde'},
  skill: {label:null, icon:'🛠️', desc:null}, // per-Welt gesetzt
  boss: {label:'Boss', icon:'👑', desc:'Schwerer Gauntlet — schließt die Welt ab'},
};
function skillMeta(world){
  return world.skillType === 'sql'
    ? {label:'SQL-Werkstatt', icon:'⌨️', desc:'Echte SQL-Abfragen live ausführen'}
    : {label:'Match-Duell', icon:'🧩', desc:'Begriffe & Szenarien zuordnen'};
}

function renderMap(el){
  const wrap = document.createElement('div');
  wrap.className = 'mapwrap';
  let html = `
    <section class="hero">
      <p class="eyebrow">SQL-ARENA · Lernspiel zur Datenbank-Werkstatt</p>
      <h1>Level up deine <mark>Datenbank-Skills</mark></h1>
      <p class="herotxt">7 Welten, echte SQL-Aufgaben und ein Boss-Gauntlet pro Thema. Sammle XP, Sterne und Münzen — und werde fit für die Prüfung.</p>
      <div class="herostats">
        <div><b>${S.xp}</b><span>XP gesamt</span></div>
        <div><b>${totalStars()}</b><span>von ${WORLDS.length*9} Sternen</span></div>
        <div><b>${S.bestStreak}</b><span>beste Serie</span></div>
      </div>
    </section>
    <div class="path">
  `;
  WORLDS.forEach((w, wi) => {
    const sMeta = skillMeta(w);
    const stages = [
      Object.assign({key:'quiz'}, STAGE_META.quiz),
      Object.assign({key:'skill'}, sMeta),
      Object.assign({key:'boss'}, STAGE_META.boss),
    ];
    html += `<div class="worldsec g-${w.color}">
      <div class="wsechead">
        <span class="wicon">${w.icon}</span>
        <div><h2>Welt ${w.n} · ${esc(w.title)}</h2><p>${esc(w.sub)}</p></div>
        <div class="wstars">${starsHtml(worldStars(w.id), 9)}</div>
      </div>
      <div class="stagerow">`;
    stages.forEach((st, si) => {
      const unlocked = isStageUnlocked(wi, si);
      const prog = (S.progress[w.id] && S.progress[w.id][st.key]) || {done:false, stars:0};
      const cls = !unlocked ? 'locked' : (prog.done ? 'done' : 'ready');
      html += `<button class="node ${cls}" data-w="${w.id}" data-s="${st.key}" ${unlocked?'':'disabled'}>
        <span class="nicon">${unlocked ? st.icon : '🔒'}</span>
        <span class="nlabel">${esc(st.label)}</span>
        ${prog.done ? starsHtml(prog.stars,3) : (unlocked ? '<span class="nhint">'+esc(st.desc)+'</span>' : '<span class="nhint">Gesperrt</span>')}
      </button>`;
    });
    html += `</div></div>`;
  });
  const examUnlocked = isExamUnlocked();
  html += `<div class="worldsec finalesec">
      <div class="wsechead">
        <span class="wicon">🏆</span>
        <div><h2>Finale · Prüfungsarena</h2><p>Gemischter Prüfungssimulator, alle Themen</p></div>
      </div>
      <div class="stagerow">
        <button class="node examnode ${examUnlocked ? (S.examBest!=null?'done':'ready') : 'locked'}" id="examBtn" ${examUnlocked?'':'disabled'}>
          <span class="nicon">${examUnlocked ? '🎓' : '🔒'}</span>
          <span class="nlabel">Prüfungsarena starten</span>
          <span class="nhint">${examUnlocked ? (S.examBest!=null ? 'Bestes Ergebnis: '+S.examBest+'%' : 'Timed Exam · alle Welten') : 'Schließe alle Boss-Level ab'}</span>
        </button>
      </div>
    </div>`;
  html += `</div>`;
  wrap.innerHTML = html;
  el.appendChild(wrap);

  wrap.querySelectorAll('.node[data-w]').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = btn.getAttribute('data-w');
      const s = btn.getAttribute('data-s');
      openStage(w, s);
    });
  });
  const examBtn = wrap.querySelector('#examBtn');
  if(examBtn) examBtn.addEventListener('click', () => nav(renderExamIntro));

  // Autoscroll zum aktuellen (nächsten offenen) Knoten
  const nextNode = wrap.querySelector('.node.ready') || wrap.querySelector('.node.done');
  if(nextNode){ setTimeout(()=> nextNode.scrollIntoView({block:'center', behavior:'instant'}), 30); }
}

function totalStars(){
  let t = 0;
  WORLDS.forEach(w => t += worldStars(w.id));
  return t;
}

function openStage(worldId, stageKey){
  const world = WORLDS.find(w => w.id === worldId);
  if(!world) return;
  if(stageKey === 'quiz') nav(el => renderStageIntro(el, world, 'quiz'));
  else if(stageKey === 'boss') nav(el => renderStageIntro(el, world, 'boss'));
  else nav(el => renderStageIntro(el, world, 'skill'));
}

function renderStageIntro(el, world, stageKey){
  const sMeta = stageKey==='skill' ? skillMeta(world) : STAGE_META[stageKey];
  const wrap = document.createElement('div');
  wrap.className = 'introwrap';
  wrap.innerHTML = `
    <button class="backlnk" id="back">← Weltkarte</button>
    <div class="introcard g-${world.color}">
      <span class="wicon big">${sMeta.icon}</span>
      <p class="eyebrow">Welt ${world.n} · ${esc(world.title)}</p>
      <h2>${esc(sMeta.label)}</h2>
      <p>${esc(sMeta.desc)}</p>
      <button class="btn primary big" id="startStage">Los geht's</button>
    </div>
  `;
  el.appendChild(wrap);
  wrap.querySelector('#back').onclick = () => nav(renderMap);
  wrap.querySelector('#startStage').onclick = () => {
    if(stageKey === 'quiz') nav(el2 => StageQuiz.render(el2, world, {pool: QUIZ[world.id], count:6, timeLimit:28, lives:3, stageKey:'quiz', xpPer:10, coinPer:2}));
    else if(stageKey === 'boss') nav(el2 => StageQuiz.render(el2, world, {pool: BOSS[world.id], count:6, timeLimit:24, lives:3, stageKey:'boss', xpPer:16, coinPer:3, boss:true}));
    else if(world.skillType === 'sql') nav(el2 => StageSql.render(el2, world, {tasks: world.id==='w5'?SQL_TASKS_W5:SQL_TASKS_W6}));
    else nav(el2 => StageMatch.render(el2, world, {pairs: pick(MATCH[world.id], Math.min(6, MATCH[world.id].length)), timeLimit: 90}));
  };
}

const Engine = {
  Store, shuffle, pick, esc, fmtNum, S, saveState, level, xpIntoLevel, addXp, addCoins, noteStreak, noteWeak,
  stageProg, completeStage, isStageUnlocked, isExamUnlocked, worldStars, totalStars,
  nav, root, renderHud, toast, confettiBurst, starsHtml, openStage,
};
