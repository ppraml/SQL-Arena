/* ============================================================
   Stage: Match-Duell — Begriffe/Szenarien gegen Zuordnung, gegen die Zeit
   ============================================================ */
const StageMatch = (() => {
  function render(el, world, cfg){
    const pairs = cfg.pairs.map((p,i) => ({...p, id:i}));
    const leftItems = shuffle(pairs.map(p => ({id:p.id, txt:p.a})));
    const rightItems = shuffle(pairs.map(p => ({id:p.id, txt:p.b})));
    let matched = new Set(), mistakes = 0, streak = 0, selL = null, selR = null, timeLeft = cfg.timeLimit, timer = null, xpGain = 0, coinGain = 0, ended = false;

    const wrap = document.createElement('div');
    wrap.className = 'stagewrap matchwrap g-'+world.color;
    el.appendChild(wrap);

    function paint(){
      wrap.innerHTML = `
        <div class="stagehead">
          <button class="backlnk" id="quit">✕</button>
          <div class="qprog"><i style="width:${Math.round(matched.size/pairs.length*100)}%"></i></div>
          <div class="mtime" id="mtime">⏱ ${Math.ceil(timeLeft)}s</div>
        </div>
        <div class="streakbadge ${streak>=3?'hot':''}" ${streak<2?'hidden':''}>🔥 ${streak}er-Serie</div>
        <p class="qcount">${matched.size} / ${pairs.length} zugeordnet ${mistakes?(' · '+mistakes+' Fehlversuche'):''}</p>
        <div class="matchgrid">
          <div class="mcol" id="colL">${leftItems.map(it => matchBtn(it,'l')).join('')}</div>
          <div class="mcol" id="colR">${rightItems.map(it => matchBtn(it,'r')).join('')}</div>
        </div>
      `;
      wrap.querySelector('#quit').onclick = () => { clearTimer(); nav(el2 => renderStageIntro(el2, world, 'skill')); };
      wrap.querySelectorAll('.mitem').forEach(b => b.addEventListener('click', onPick));
    }
    function matchBtn(it, side){
      const done = matched.has(it.id);
      const sel = (side==='l' && selL===it.id) || (side==='r' && selR===it.id);
      return `<button class="mitem ${done?'done':''} ${sel?'sel':''}" data-side="${side}" data-id="${it.id}" ${done?'disabled':''}>${esc(it.txt)}</button>`;
    }

    function onPick(e){
      if(ended) return;
      const side = e.currentTarget.getAttribute('data-side');
      const id = parseInt(e.currentTarget.getAttribute('data-id'),10);
      if(matched.has(id)) return;
      if(side==='l') selL = (selL===id) ? null : id; else selR = (selR===id) ? null : id;
      paint();
      if(selL!=null && selR!=null){
        if(selL === selR){
          matched.add(selL);
          streak++; noteStreak(streak);
          const mult = streak>=6?3:(streak>=3?2:1);
          xpGain += 12*mult; coinGain += 2;
          toast('Match! +'+(12*mult)+' XP', 'ok');
          selL = null; selR = null;
          paint();
          if(matched.size === pairs.length) finish(true);
        } else {
          mistakes++; streak = 0;
          const l = wrap.querySelector(`.mitem[data-side="l"][data-id="${selL}"]`);
          const r = wrap.querySelector(`.mitem[data-side="r"][data-id="${selR}"]`);
          if(l) l.classList.add('shake'); if(r) r.classList.add('shake');
          timeLeft = Math.max(1, timeLeft - 2);
          setTimeout(() => { selL=null; selR=null; paint(); }, 420);
        }
      }
    }

    function clearTimer(){ if(timer){ clearInterval(timer); timer=null; } }
    function startTimer(){
      timer = setInterval(() => {
        timeLeft -= 0.2;
        const t = wrap.querySelector('#mtime');
        if(t) t.textContent = '⏱ ' + Math.max(0,Math.ceil(timeLeft)) + 's';
        if(timeLeft <= 0){ clearTimer(); finish(matched.size===pairs.length); }
      }, 200);
    }

    function finish(passed){
      ended = true;
      clearTimer();
      let stars = 0;
      if(passed){
        stars = mistakes===0 ? 3 : (mistakes<=2 ? 2 : 1);
        xpGain += 15;
        completeStage(world.id, 'skill', stars, Math.round(matched.size/pairs.length*100));
      }
      wrap.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'resultcard ' + (passed?'win':'lose');
      card.innerHTML = passed ? `
        <div class="confwrap"></div>
        <span class="ricon">🧩</span>
        <h2>Alle zugeordnet!</h2>
        <p>${mistakes} Fehlversuche</p>
        ${starsHtml(stars,3)}
        <p class="rewards">+${xpGain} XP · +${coinGain} 🪙</p>
        <div class="rbtns">
          <button class="btn" id="again">Nochmal</button>
          <button class="btn primary" id="toMap">Weiter zur Karte</button>
        </div>
      ` : `
        <span class="ricon">⏱️</span>
        <h2>Zeit abgelaufen</h2>
        <p>${matched.size} von ${pairs.length} geschafft — nochmal versuchen?</p>
        <div class="rbtns">
          <button class="btn primary" id="again">Nochmal versuchen</button>
          <button class="btn" id="toMap">Zur Karte</button>
        </div>
      `;
      wrap.appendChild(card);
      if(passed){ addXp(xpGain); addCoins(coinGain); confettiBurst(card.querySelector('.confwrap')); }
      card.querySelector('#again').onclick = () => nav(el2 => render(el2, world, {pairs: pick(MATCH[world.id], Math.min(6, MATCH[world.id].length)), timeLimit: cfg.timeLimit}));
      card.querySelector('#toMap').onclick = () => nav(renderMap);
    }

    paint();
    startTimer();
    return () => clearTimer();
  }
  return {render};
})();
