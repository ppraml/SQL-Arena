/* ============================================================
   Stage: Quiz-Sprint / Boss — schnelle Multiple-Choice-Runde
   ============================================================ */
const StageQuiz = (() => {
  function render(el, world, cfg){
    const items = shuffle(cfg.pool).slice(0, Math.min(cfg.count, cfg.pool.length)).map(q => {
      const order = shuffle(q.o.map((_,i)=>i));
      return {q: q.q, o: order.map(i=>q.o[i]), c: order.indexOf(q.c), e: q.e, _srcWorld: q._srcWorld || world.id};
    });
    let idx = 0, lives = cfg.lives, correct = 0, streak = 0, xpGain = 0, coinGain = 0, timer = null, timeLeft = 0, answered = false;

    const wrap = document.createElement('div');
    wrap.className = 'stagewrap quizwrap g-'+world.color;
    el.appendChild(wrap);

    function clearTimer(){ if(timer){ clearInterval(timer); timer = null; } }

    function paint(){
      const it = items[idx];
      timeLeft = cfg.timeLimit;
      answered = false;
      wrap.innerHTML = `
        <div class="stagehead">
          <button class="backlnk" id="quit">✕</button>
          <div class="qprog"><i style="width:${Math.round(idx/items.length*100)}%"></i></div>
          <div class="lives">${'❤️'.repeat(lives)}${'🖤'.repeat(cfg.lives-lives)}</div>
        </div>
        <div class="streakbadge ${streak>=3?'hot':''}" ${streak<2?'hidden':''}>🔥 ${streak}er-Serie</div>
        <div class="timerbar"><i id="tbar" style="width:100%"></i></div>
        <h3 class="qtext">${esc(it.q)}</h3>
        <div class="opts">
          ${it.o.map((o,i)=>`<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}
        </div>
        <p class="qcount">Frage ${idx+1} / ${items.length}</p>
      `;
      wrap.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(parseInt(b.getAttribute('data-i'),10))));
      wrap.querySelector('#quit').onclick = () => confirmQuit();
      startTimer();
    }

    function startTimer(){
      clearTimer();
      const bar = () => wrap.querySelector('#tbar');
      timer = setInterval(() => {
        timeLeft -= 0.1;
        const b = bar();
        if(b) b.style.width = Math.max(0, (timeLeft/cfg.timeLimit*100)) + '%';
        if(timeLeft <= 0){ clearTimer(); answer(-1); }
      }, 100);
    }

    function confirmQuit(){
      clearTimer();
      nav(el2 => renderStageIntro(el2, world, cfg.stageKey));
    }

    function answer(i){
      if(answered) return;
      answered = true;
      clearTimer();
      const it = items[idx];
      const ok = i === it.c;
      const btns = wrap.querySelectorAll('.opt');
      btns.forEach((b,bi) => {
        b.disabled = true;
        if(bi === it.c) b.classList.add('correct');
        else if(bi === i) b.classList.add('wrong');
      });
      if(ok){
        correct++; streak++;
        noteStreak(streak);
        const mult = streak>=6?3:(streak>=3?2:1);
        xpGain += cfg.xpPer * mult;
        coinGain += cfg.coinPer;
        toast('+'+(cfg.xpPer*mult)+' XP'+(mult>1?' (×'+mult+' Serie!)':''), 'ok');
      } else {
        lives--; streak = 0;
      }
      noteWeak(world.id, ok);
      const srcW = it._srcWorld || world.id;
      if(ok) clearMissed('quiz', srcW, it.q); else noteMissed('quiz', srcW, it.q);
      const expl = document.createElement('div');
      expl.className = 'expl ' + (ok?'ok':'no');
      expl.innerHTML = `<b>${ok?'Richtig!':(i===-1?'Zeit abgelaufen.':'Nicht ganz.')}</b> ${esc(it.e||'')}
        <div class="nextrow"><button class="btn primary" id="nextBtn">Weiter →</button></div>`;
      wrap.appendChild(expl);
      const advance = () => {
        if(lives <= 0){ finish(false); return; }
        idx++;
        if(idx >= items.length){ finish(true); return; }
        paint();
      };
      const nb = wrap.querySelector('#nextBtn');
      nb.focus();
      nb.onclick = advance;
      wrap.addEventListener('keydown', function onKey(e){
        if(e.key==='Enter'){ wrap.removeEventListener('keydown', onKey); advance(); }
      });
    }

    function finish(passed){
      clearTimer();
      const pct = Math.round(correct/items.length*100);
      let stars = 0;
      if(passed){
        stars = pct>=100 ? 3 : (pct>=70 ? 2 : 1);
        xpGain += 15;
        completeStage(world.id, cfg.stageKey, stars, pct);
      }
      wrap.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'resultcard ' + (passed?'win':'lose');
      card.innerHTML = passed ? `
        <div class="confwrap"></div>
        <span class="ricon">${cfg.boss?'👑':'🎉'}</span>
        <h2>${cfg.boss?'Boss besiegt!':'Runde geschafft!'}</h2>
        <p>${correct} von ${items.length} richtig · ${pct}%</p>
        ${starsHtml(stars,3)}
        <p class="rewards">+${xpGain} XP · +${coinGain} 🪙</p>
        <div class="rbtns">
          <button class="btn" id="again">Nochmal</button>
          <button class="btn primary" id="toMap">Weiter zur Karte</button>
        </div>
      ` : `
        <span class="ricon">💔</span>
        <h2>Leben aufgebraucht</h2>
        <p>${correct} von ${idx+1} richtig geschafft — versuch's gleich nochmal!</p>
        <div class="rbtns">
          <button class="btn primary" id="again">Nochmal versuchen</button>
          <button class="btn" id="toMap">Zur Karte</button>
        </div>
      `;
      wrap.appendChild(card);
      if(passed){ addXp(xpGain); addCoins(coinGain); confettiBurst(card.querySelector('.confwrap')); }
      card.querySelector('#again').onclick = () => nav(el2 => render(el2, world, cfg));
      card.querySelector('#toMap').onclick = () => nav(renderMap);
    }

    paint();
    return () => clearTimer();
  }
  return {render};
})();
