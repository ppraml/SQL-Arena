/* ============================================================
   Mini-SQL-Engine — Tokenizer, Parser, Evaluator
   Unterstützt: SELECT (DISTINCT, *, Ausdrücke, Aggregatfunktionen,
   JOIN/INNER JOIN/LEFT JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT),
   INSERT INTO ... VALUES, UPDATE ... SET ... WHERE, DELETE FROM ... WHERE.
   Arbeitet auf einer einfachen In-Memory-DB: {TABLE:[{col:val,...},...]}
   ============================================================ */
(function(root){
'use strict';

/* ---------- Tokenizer ---------- */
const KEYWORDS = new Set(['SELECT','FROM','WHERE','AND','OR','NOT','AS','JOIN','INNER','LEFT','RIGHT','OUTER',
  'ON','GROUP','BY','HAVING','ORDER','ASC','DESC','LIMIT','DISTINCT','IN','IS','NULL','LIKE','BETWEEN',
  'INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','PRIMARY','KEY','FOREIGN','REFERENCES',
  'NOT','DEFAULT','UNIQUE','TRUE','FALSE','UNION','ALL','EXISTS']);

function tokenize(sql){
  const toks = []; let i = 0; const n = sql.length;
  const isDigit = c => c >= '0' && c <= '9';
  const isAlpha = c => /[A-Za-zÄÖÜäöüß_]/.test(c);
  const isAlnum = c => /[A-Za-z0-9ÄÖÜäöüß_]/.test(c);
  while(i < n){
    const c = sql[i];
    if(/\s/.test(c)){ i++; continue; }
    if(c === '-' && sql[i+1] === '-'){ while(i<n && sql[i] !== '\n') i++; continue; }
    if(c === "'"){
      let j = i+1, s = '';
      while(j < n){
        if(sql[j] === "'" && sql[j+1] === "'"){ s += "'"; j += 2; continue; }
        if(sql[j] === "'") break;
        s += sql[j]; j++;
      }
      toks.push({t:'str', v:s}); i = j+1; continue;
    }
    if(c === '"'){
      let j = i+1, s = '';
      while(j < n && sql[j] !== '"'){ s += sql[j]; j++; }
      toks.push({t:'ident', v:s}); i = j+1; continue;
    }
    if(isDigit(c) || (c === '.' && isDigit(sql[i+1]))){
      let j = i, s = '';
      while(j < n && (isDigit(sql[j]) || sql[j] === '.')){ s += sql[j]; j++; }
      toks.push({t:'num', v:parseFloat(s)}); i = j; continue;
    }
    if(isAlpha(c)){
      let j = i, s = '';
      while(j < n && isAlnum(sql[j])){ s += sql[j]; j++; }
      const up = s.toUpperCase();
      if(KEYWORDS.has(up)) toks.push({t:'kw', v:up});
      else toks.push({t:'ident', v:s});
      i = j; continue;
    }
    if(c === '<' && sql[i+1] === '='){ toks.push({t:'op', v:'<='}); i+=2; continue; }
    if(c === '>' && sql[i+1] === '='){ toks.push({t:'op', v:'>='}); i+=2; continue; }
    if(c === '<' && sql[i+1] === '>'){ toks.push({t:'op', v:'!='}); i+=2; continue; }
    if(c === '!' && sql[i+1] === '='){ toks.push({t:'op', v:'!='}); i+=2; continue; }
    if('=<>+-*/,.()'.includes(c)){ toks.push({t: (c===','||c==='('||c===')'||c==='.') ? 'punc' : 'op', v:c}); i++; continue; }
    if(c === ';'){ i++; continue; }
    throw new SqlError("Unerwartetes Zeichen: '"+c+"'");
  }
  toks.push({t:'eof', v:null});
  return toks;
}

class SqlError extends Error {}

/* ---------- Parser ---------- */
class Parser {
  constructor(toks){ this.toks = toks; this.p = 0; }
  peek(){ return this.toks[this.p]; }
  next(){ return this.toks[this.p++]; }
  isKw(v){ const t = this.peek(); return t.t === 'kw' && t.v === v; }
  isOp(v){ const t = this.peek(); return (t.t === 'op' || t.t === 'punc') && t.v === v; }
  eatKw(v){ if(!this.isKw(v)) throw new SqlError('Erwartet: '+v+', gefunden: '+this._show()); return this.next(); }
  eatOp(v){ if(!this.isOp(v)) throw new SqlError('Erwartet: "'+v+'", gefunden: '+this._show()); return this.next(); }
  _show(){ const t = this.peek(); return t.t==='eof' ? 'Ende' : JSON.stringify(t.v); }

  parseStatement(){
    if(this.isKw('SELECT')) return this.parseSelect();
    if(this.isKw('INSERT')) return this.parseInsert();
    if(this.isKw('UPDATE')) return this.parseUpdate();
    if(this.isKw('DELETE')) return this.parseDelete();
    if(this.isKw('CREATE')) return this.parseCreate();
    throw new SqlError('Unbekannte Anweisung (erwarte SELECT/INSERT/UPDATE/DELETE/CREATE): '+this._show());
  }

  parseIdentPath(){
    // ident[.ident] oder *
    if(this.isOp('*')){ this.next(); return {type:'star'}; }
    const first = this.next();
    if(first.t !== 'ident' && first.t !== 'kw') throw new SqlError('Bezeichner erwartet, gefunden: '+JSON.stringify(first.v));
    let name = first.v;
    if(this.isOp('.')){
      this.next();
      if(this.isOp('*')){ this.next(); return {type:'star', table:name}; }
      const second = this.next();
      return {type:'col', table:name, col:second.v};
    }
    return {type:'col', table:null, col:name};
  }

  parseSelect(){
    this.eatKw('SELECT');
    let distinct = false;
    if(this.isKw('DISTINCT')){ this.next(); distinct = true; }
    const cols = [];
    do{
      if(this.isOp(',')) this.next();
      cols.push(this.parseSelectItem());
    } while(this.isOp(','));
    this.eatKw('FROM');
    const from = this.parseTableRef();
    const joins = [];
    while(this.isKw('JOIN') || this.isKw('INNER') || this.isKw('LEFT') || this.isKw('RIGHT')){
      let jt = 'INNER';
      if(this.isKw('LEFT')){ jt='LEFT'; this.next(); if(this.isKw('OUTER')) this.next(); }
      else if(this.isKw('RIGHT')){ jt='RIGHT'; this.next(); if(this.isKw('OUTER')) this.next(); }
      else if(this.isKw('INNER')){ jt='INNER'; this.next(); }
      this.eatKw('JOIN');
      const tbl = this.parseTableRef();
      this.eatKw('ON');
      const on = this.parseExprOr();
      joins.push({type:jt, table:tbl, on});
    }
    let where = null;
    if(this.isKw('WHERE')){ this.next(); where = this.parseExprOr(); }
    let groupBy = null;
    if(this.isKw('GROUP')){ this.next(); this.eatKw('BY'); groupBy = []; do{ if(this.isOp(',')) this.next(); groupBy.push(this.parseIdentPath()); } while(this.isOp(',')); }
    let having = null;
    if(this.isKw('HAVING')){ this.next(); having = this.parseExprOr(); }
    let orderBy = null;
    if(this.isKw('ORDER')){ this.next(); this.eatKw('BY'); orderBy = []; do{
        if(this.isOp(',')) this.next();
        const e = this.parseAddSub();
        let dir = 'ASC';
        if(this.isKw('ASC')){ this.next(); } else if(this.isKw('DESC')){ this.next(); dir='DESC'; }
        orderBy.push({expr:e, dir});
      } while(this.isOp(','));
    }
    let limit = null;
    if(this.isKw('LIMIT')){ this.next(); const t = this.next(); limit = t.v; }
    return {type:'select', distinct, cols, from, joins, where, groupBy, having, orderBy, limit};
  }

  parseSelectItem(){
    const e = this.parseAddSub();
    let alias = null;
    if(this.isKw('AS')){ this.next(); alias = this.next().v; }
    else if(this.peek().t === 'ident'){ alias = this.next().v; }
    return {expr:e, alias};
  }

  parseTableRef(){
    const nameTok = this.next();
    const name = nameTok.v;
    let alias = null;
    if(this.isKw('AS')){ this.next(); alias = this.next().v; }
    else if(this.peek().t === 'ident'){ alias = this.next().v; }
    return {name, alias};
  }

  // Ausdrücke (Booleans mit OR/AND/NOT, Vergleich, +-*/, Funktionen)
  parseExprOr(){
    let left = this.parseExprAnd();
    while(this.isKw('OR')){ this.next(); const right = this.parseExprAnd(); left = {op:'OR', l:left, r:right}; }
    return left;
  }
  parseExprAnd(){
    let left = this.parseExprNot();
    while(this.isKw('AND')){ this.next(); const right = this.parseExprNot(); left = {op:'AND', l:left, r:right}; }
    return left;
  }
  parseExprNot(){
    if(this.isKw('NOT')){ this.next(); return {op:'NOT', e:this.parseExprNot()}; }
    return this.parsePredicate();
  }
  parsePredicate(){
    if(this.isOp('(')){
      // Könnte geklammerter Bool-Ausdruck sein
      const save = this.p;
      this.next();
      try{
        const inner = this.parseExprOr();
        if(this.isOp(')')){ this.next(); return this.maybeChainAfterParen(inner); }
      }catch(e){}
      this.p = save;
    }
    const left = this.parseAddSub();
    if(this.isKw('IS')){
      this.next();
      let neg = false;
      if(this.isKw('NOT')){ this.next(); neg = true; }
      this.eatKw('NULL');
      return {op: neg?'ISNOTNULL':'ISNULL', e:left};
    }
    if(this.isKw('NOT')){
      this.next();
      if(this.isKw('LIKE')){ this.next(); const r = this.parseAddSub(); return {op:'NOT', e:{op:'LIKE', l:left, r}}; }
      if(this.isKw('IN')){ this.next(); const list = this.parseInList(); return {op:'NOT', e:{op:'IN', l:left, r:list}}; }
      if(this.isKw('BETWEEN')){ this.next(); const lo=this.parseAddSub(); this.eatKw('AND'); const hi=this.parseAddSub(); return {op:'NOT', e:{op:'BETWEEN', e:left, lo, hi}}; }
      throw new SqlError('NOT ... erwartet LIKE/IN/BETWEEN');
    }
    if(this.isKw('LIKE')){ this.next(); const r = this.parseAddSub(); return {op:'LIKE', l:left, r}; }
    if(this.isKw('IN')){ this.next(); const list = this.parseInList(); return {op:'IN', l:left, r:list}; }
    if(this.isKw('BETWEEN')){ this.next(); const lo=this.parseAddSub(); this.eatKw('AND'); const hi=this.parseAddSub(); return {op:'BETWEEN', e:left, lo, hi}; }
    const t = this.peek();
    if(t.t === 'op' && ['=','!=','<','>','<=','>='].includes(t.v)){
      this.next();
      const right = this.parseAddSub();
      return {op:'CMP', cmp:t.v, l:left, r:right};
    }
    return left; // roher Ausdruck (z.B. Spalte als boolescher Kontext, selten)
  }
  maybeChainAfterParen(inner){ return inner; }
  parseInList(){
    this.eatOp('(');
    const items = [];
    do{ if(this.isOp(',')) this.next(); items.push(this.parseAddSub()); } while(this.isOp(','));
    this.eatOp(')');
    return items;
  }

  parseAddSub(){
    let left = this.parseMulDiv();
    while(this.isOp('+') || this.isOp('-')){
      const op = this.next().v;
      const right = this.parseMulDiv();
      left = {op:'ARITH', a:op, l:left, r:right};
    }
    return left;
  }
  parseMulDiv(){
    let left = this.parseUnary();
    while(this.isOp('*') || this.isOp('/')){
      const op = this.next().v;
      const right = this.parseUnary();
      left = {op:'ARITH', a:op, l:left, r:right};
    }
    return left;
  }
  parseUnary(){
    if(this.isOp('-')){ this.next(); const e = this.parseUnary(); return {op:'NEG', e}; }
    return this.parsePrimary();
  }
  parsePrimary(){
    const t = this.peek();
    if(t.t === 'num'){ this.next(); return {op:'LIT', v:t.v}; }
    if(t.t === 'str'){ this.next(); return {op:'LIT', v:t.v}; }
    if(this.isKw('NULL')){ this.next(); return {op:'LIT', v:null}; }
    if(this.isKw('TRUE')){ this.next(); return {op:'LIT', v:true}; }
    if(this.isKw('FALSE')){ this.next(); return {op:'LIT', v:false}; }
    if(this.isOp('(')){
      this.next();
      const e = this.parseExprOr();
      this.eatOp(')');
      return e;
    }
    if(this.isOp('*')){ this.next(); return {op:'STAR'}; }
    // Funktion oder Spalte
    if(t.t === 'ident' || t.t === 'kw'){
      const nameTok = this.next();
      const name = nameTok.v;
      if(this.isOp('(')){
        this.next();
        let distinct = false;
        if(this.isKw('DISTINCT')){ this.next(); distinct = true; }
        const args = [];
        if(!this.isOp(')')){
          do{ if(this.isOp(',')) this.next(); args.push(this.isOp('*') ? (this.next(), {op:'STAR'}) : this.parseExprOr()); } while(this.isOp(','));
        }
        this.eatOp(')');
        return {op:'FUNC', name:name.toUpperCase(), args, distinct};
      }
      if(this.isOp('.')){
        this.next();
        const col = this.next();
        return {op:'COL', table:name, col: col.v};
      }
      return {op:'COL', table:null, col:name};
    }
    throw new SqlError('Unerwarteter Ausdruck: '+this._show());
  }

  parseInsert(){
    this.eatKw('INSERT'); this.eatKw('INTO');
    const table = this.next().v;
    let cols = null;
    if(this.isOp('(')){
      this.next(); cols = [];
      do{ if(this.isOp(',')) this.next(); cols.push(this.next().v); } while(this.isOp(','));
      this.eatOp(')');
    }
    this.eatKw('VALUES');
    const rows = [];
    do{
      if(this.isOp(',')) this.next();
      this.eatOp('(');
      const vals = [];
      do{ if(this.isOp(',')) this.next(); vals.push(this.parseAddSub()); } while(this.isOp(','));
      this.eatOp(')');
      rows.push(vals);
    } while(this.isOp(','));
    return {type:'insert', table, cols, rows};
  }

  parseUpdate(){
    this.eatKw('UPDATE');
    const table = this.next().v;
    this.eatKw('SET');
    const sets = [];
    do{
      if(this.isOp(',')) this.next();
      const col = this.next().v;
      this.eatOp('=');
      const val = this.parseAddSub();
      sets.push({col, val});
    } while(this.isOp(','));
    let where = null;
    if(this.isKw('WHERE')){ this.next(); where = this.parseExprOr(); }
    return {type:'update', table, sets, where};
  }

  parseDelete(){
    this.eatKw('DELETE'); this.eatKw('FROM');
    const table = this.next().v;
    let where = null;
    if(this.isKw('WHERE')){ this.next(); where = this.parseExprOr(); }
    return {type:'delete', table, where};
  }

  parseCreate(){
    this.eatKw('CREATE'); this.eatKw('TABLE');
    const table = this.next().v;
    this.eatOp('(');
    const cols = [];
    do{
      if(this.isOp(',')) this.next();
      if(this.isKw('PRIMARY')){ this.next(); this.eatKw('KEY'); this.eatOp('('); const pk=[]; do{ if(this.isOp(',')) this.next(); pk.push(this.next().v); }while(this.isOp(',')); this.eatOp(')'); cols.push({kind:'PK', cols:pk}); continue; }
      if(this.isKw('FOREIGN')){ this.next(); this.eatKw('KEY'); this.eatOp('('); const fk=[]; do{ if(this.isOp(',')) this.next(); fk.push(this.next().v); }while(this.isOp(',')); this.eatOp(')'); this.eatKw('REFERENCES'); const rt=this.next().v; let rc=null; if(this.isOp('(')){ this.next(); rc=this.next().v; this.eatOp(')'); } cols.push({kind:'FK', cols:fk, refTable:rt, refCol:rc}); continue; }
      const cname = this.next().v;
      let ctype = this.next().v; // e.g. INT, VARCHAR
      if(this.isOp('(')){ this.next(); while(!this.isOp(')')) this.next(); this.next(); }
      const flags = [];
      while(true){
        if(this.isKw('PRIMARY')){ this.next(); this.eatKw('KEY'); flags.push('PK'); continue; }
        if(this.isKw('NOT')){ this.next(); this.eatKw('NULL'); flags.push('NOTNULL'); continue; }
        if(this.isKw('NULL')){ this.next(); continue; }
        if(this.isKw('UNIQUE')){ this.next(); flags.push('UNIQUE'); continue; }
        if(this.isKw('DEFAULT')){ this.next(); this.parseAddSub(); flags.push('DEFAULT'); continue; }
        if(this.isKw('REFERENCES')){ this.next(); const rt=this.next().v; let rc=null; if(this.isOp('(')){ this.next(); rc=this.next().v; this.eatOp(')'); } flags.push('FK:'+rt+(rc?'.'+rc:'')); continue; }
        break;
      }
      cols.push({kind:'COL', name:cname, dtype:String(ctype).toUpperCase(), flags});
    } while(this.isOp(','));
    this.eatOp(')');
    return {type:'create', table, cols};
  }
}

function parseSQL(sql){
  const toks = tokenize(sql);
  const p = new Parser(toks);
  const stmt = p.parseStatement();
  if(p.peek().t !== 'eof') throw new SqlError('Unerwartete Zeichen nach Anweisung: '+p._show());
  return stmt;
}

/* ---------- Evaluator ---------- */
function cloneDb(db){
  const out = {};
  for(const k in db) out[k] = db[k].map(r => Object.assign({}, r));
  return out;
}

function findTable(db, name){
  const key = Object.keys(db).find(k => k.toUpperCase() === String(name).toUpperCase());
  if(!key) throw new SqlError('Unbekannte Tabelle: '+name);
  return {key, rows: db[key]};
}

// env: {tableAliasUpper: rowObjectOrNull, ...}, plus __agg for aggregate context
function resolveCol(env, table, col){
  if(table){
    const key = Object.keys(env).find(k => k.toUpperCase() === table.toUpperCase());
    if(!key) throw new SqlError('Unbekannter Tabellen-Alias: '+table);
    const row = env[key];
    if(row == null) return null;
    const ck = Object.keys(row).find(k => k.toUpperCase() === col.toUpperCase());
    return ck ? row[ck] : null;
  }
  // Suche in allen Tabellen des Envs
  let found, count = 0;
  for(const k in env){
    const row = env[k];
    if(row == null) continue;
    const ck = Object.keys(row).find(x => x.toUpperCase() === col.toUpperCase());
    if(ck){ found = row[ck]; count++; }
  }
  if(count === 0) return null;
  return found;
}

function evalExpr(e, env){
  switch(e.op){
    case 'LIT': return e.v;
    case 'COL': return resolveCol(env, e.table, e.col);
    case 'STAR': return '*';
    case 'NEG': return -evalExpr(e.e, env);
    case 'ARITH': {
      const l = evalExpr(e.l, env), r = evalExpr(e.r, env);
      if(l == null || r == null) return null;
      switch(e.a){ case '+': return l+r; case '-': return l-r; case '*': return l*r; case '/': return r===0?null:l/r; }
      return null;
    }
    case 'AND': { const l = evalExpr(e.l, env); if(l===false) return false; const r = evalExpr(e.r, env); return !!(l && r); }
    case 'OR': { const l = evalExpr(e.l, env); if(l===true) return true; const r = evalExpr(e.r, env); return !!(l || r); }
    case 'NOT': { const v = evalExpr(e.e, env); return v==null ? null : !v; }
    case 'CMP': {
      const l = evalExpr(e.l, env), r = evalExpr(e.r, env);
      if(l == null || r == null) return null;
      const lv = (typeof l === 'string' && typeof r === 'string') ? l : l, rv = r;
      switch(e.cmp){
        case '=': return lv == rv;
        case '!=': return lv != rv;
        case '<': return lv < rv;
        case '>': return lv > rv;
        case '<=': return lv <= rv;
        case '>=': return lv >= rv;
      }
      return null;
    }
    case 'ISNULL': return evalExpr(e.e, env) == null;
    case 'ISNOTNULL': return evalExpr(e.e, env) != null;
    case 'LIKE': {
      const l = evalExpr(e.l, env); const r = evalExpr(e.r, env);
      if(l == null || r == null) return null;
      const pattern = '^'+String(r).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*').replace(/_/g,'.')+'$';
      return new RegExp(pattern, 'i').test(String(l));
    }
    case 'IN': {
      const l = evalExpr(e.l, env);
      if(l == null) return null;
      return e.r.some(x => evalExpr(x, env) == l);
    }
    case 'BETWEEN': {
      const v = evalExpr(e.e, env), lo = evalExpr(e.lo, env), hi = evalExpr(e.hi, env);
      if(v==null||lo==null||hi==null) return null;
      return v >= lo && v <= hi;
    }
    case 'FUNC': {
      // Nicht-aggregierte Funktionen (aggregate werden separat behandelt)
      return evalFunc(e, env);
    }
  }
  throw new SqlError('Kann Ausdruck nicht auswerten: '+JSON.stringify(e));
}

const AGG_FUNCS = new Set(['COUNT','SUM','AVG','MIN','MAX']);

function evalFunc(e, env){
  const name = e.name;
  if(name === 'UPPER') return String(evalExpr(e.args[0], env) ?? '').toUpperCase();
  if(name === 'LOWER') return String(evalExpr(e.args[0], env) ?? '').toLowerCase();
  if(name === 'ROUND'){ const v = evalExpr(e.args[0], env); const d = e.args[1]?evalExpr(e.args[1],env):0; return v==null?null:Math.round(v*Math.pow(10,d))/Math.pow(10,d); }
  if(AGG_FUNCS.has(name)) throw new SqlError('Aggregatfunktion '+name+' außerhalb eines gültigen Kontexts');
  throw new SqlError('Unbekannte Funktion: '+name);
}

function evalAgg(e, rows){
  const name = e.name;
  let vals;
  if(e.args.length === 1 && e.args[0].op === 'STAR'){
    vals = rows.map(() => 1);
  } else {
    vals = rows.map(r => evalExpr(e.args[0], r));
    if(e.distinct){ const seen = new Set(); vals = vals.filter(v => { const k=JSON.stringify(v); if(seen.has(k)) return false; seen.add(k); return true; }); }
  }
  const nonNull = vals.filter(v => v != null);
  switch(name){
    case 'COUNT': return e.args.length===1 && e.args[0].op==='STAR' ? rows.length : nonNull.length;
    case 'SUM': return nonNull.length ? nonNull.reduce((a,b)=>a+b,0) : 0;
    case 'AVG': return nonNull.length ? nonNull.reduce((a,b)=>a+b,0)/nonNull.length : null;
    case 'MIN': return nonNull.length ? nonNull.reduce((a,b)=> b<a?b:a) : null;
    case 'MAX': return nonNull.length ? nonNull.reduce((a,b)=> b>a?b:a) : null;
  }
  throw new SqlError('Unbekannte Aggregatfunktion: '+name);
}

function exprHasAgg(e){
  if(!e || typeof e !== 'object') return false;
  if(e.op === 'FUNC' && AGG_FUNCS.has(e.name)) return true;
  for(const k of ['l','r','e','lo','hi']) if(e[k] && exprHasAgg(e[k])) return true;
  if(e.args) for(const a of e.args) if(exprHasAgg(a)) return true;
  return false;
}

function colLabel(item, idx){
  if(item.alias) return item.alias;
  const e = item.expr;
  if(e.op === 'COL') return e.col;
  if(e.op === 'FUNC') return e.name.toLowerCase()+'('+(e.args.length===1&&e.args[0].op==='STAR'?'*':(e.args[0].op==='COL'?e.args[0].col:'…'))+')';
  return 'col'+(idx+1);
}

function makeEnvFromRow(tableKey, row){ const env = {}; env[tableKey] = row; return env; }
function mergeEnv(a, b){ return Object.assign({}, a, b); }

function runSelect(stmt, db){
  const {key: fromKey, rows: fromRows} = findTable(db, stmt.from.name);
  const fromAlias = stmt.from.alias || stmt.from.name;
  let combined = fromRows.map(r => makeEnvFromRow(fromAlias, r));

  for(const j of stmt.joins){
    const {rows: joinRows} = findTable(db, j.table.name);
    const joinAlias = j.table.alias || j.table.name;
    const next = [];
    for(const leftEnv of combined){
      let matched = false;
      for(const r of joinRows){
        const env = mergeEnv(leftEnv, makeEnvFromRow(joinAlias, r));
        let ok;
        try{ ok = evalExpr(j.on, env); } catch(err){ ok = false; }
        if(ok){ matched = true; next.push(env); }
      }
      if(!matched && j.type === 'LEFT'){
        const nullRow = {}; // alle Spaltennamen unbekannt -> resolveCol gibt null zurück, da env[alias]=null
        next.push(mergeEnv(leftEnv, {[joinAlias]: null}));
      }
    }
    combined = next;
  }

  if(stmt.where){
    combined = combined.filter(env => {
      try{ return evalExpr(stmt.where, env) === true; } catch(err){ return false; }
    });
  }

  const hasAgg = stmt.cols.some(c => exprHasAgg(c.expr)) || (stmt.having && exprHasAgg(stmt.having));

  let groups;
  if(stmt.groupBy && stmt.groupBy.length){
    const map = new Map();
    for(const env of combined){
      const keyParts = stmt.groupBy.map(g => resolveCol(env, g.table, g.col));
      const key = JSON.stringify(keyParts);
      if(!map.has(key)) map.set(key, {keyParts, rows:[]});
      map.get(key).rows.push(env);
    }
    groups = [...map.values()];
  } else if(hasAgg){
    groups = [{keyParts:[], rows: combined}];
  } else {
    groups = combined.map(env => ({keyParts:[], rows:[env], single:env}));
  }

  let outRows = groups.map(g => {
    const rep = g.single || g.rows[0] || {};
    return stmt.cols.map(c => {
      if(exprHasAgg(c.expr)){
        if(c.expr.op === 'FUNC' && AGG_FUNCS.has(c.expr.name)) return evalAgg(c.expr, g.rows);
        return evalArithWithAgg(c.expr, g.rows);
      }
      if(c.expr.op === 'STAR'){ return '*ALLCOLS*'; }
      return evalExpr(c.expr, rep);
    });
  });

  // STAR-Expansion (SELECT * oder table.*)
  const expandedCols = [];
  stmt.cols.forEach((c, idx) => {
    if(c.expr.op === 'STAR'){
      if(c.expr.table){
        const {rows} = findTable(db, resolveAliasTableName(stmt, c.expr.table));
        const sampleRow = fromRows[0] || {};
        Object.keys(rowSampleFor(stmt, db, c.expr.table)).forEach(k => expandedCols.push({label:k, src:{star:c.expr.table, col:k}}));
      } else {
        // alle Tabellen (from + joins) in Reihenfolge
        const tables = [stmt.from, ...stmt.joins.map(j=>j.table)];
        tables.forEach(t => {
          const {rows} = findTable(db, t.name);
          const sample = rows[0] || {};
          Object.keys(sample).forEach(k => expandedCols.push({label:k, src:{star:t.alias||t.name, col:k}}));
        });
      }
    } else {
      expandedCols.push({label: colLabel(c, idx), src:{idx}});
    }
  });

  // Falls STAR verwendet wurde, Zeilen neu aus combined (bzw. groups) bauen
  const usesStar = stmt.cols.some(c => c.expr.op === 'STAR');
  if(usesStar){
    outRows = groups.map(g => {
      const rep = g.single || g.rows[0] || {};
      return expandedCols.map(ec => {
        if(ec.src.idx !== undefined){
          const c = stmt.cols[ec.src.idx];
          if(exprHasAgg(c.expr)) return evalAgg(c.expr, g.rows);
          return evalExpr(c.expr, rep);
        }
        return resolveCol(rep, ec.src.star, ec.src.col);
      });
    });
  }

  let columns = expandedCols.map(ec => ec.label);

  // HAVING
  if(stmt.having){
    const keep = [];
    groups.forEach((g, gi) => {
      const rep = g.single || g.rows[0] || {};
      const ok = evalHaving(stmt.having, g.rows, rep);
      if(ok) keep.push(gi);
    });
    outRows = keep.map(i => outRows[i]);
    groups = keep.map(i => groups[i]);
  }

  // ORDER BY
  if(stmt.orderBy){
    const idxOf = (expr) => {
      if(expr.op === 'COL'){
        const i = columns.findIndex(c => c.toUpperCase() === expr.col.toUpperCase());
        if(i >= 0) return i;
      }
      return -1;
    };
    const keyFns = stmt.orderBy.map(ob => {
      const i = idxOf(ob.expr);
      return {i, dir: ob.dir, expr: ob.expr};
    });
    const decorated = outRows.map((row, ri) => ({row, ri, g: groups[ri]}));
    decorated.sort((a,b) => {
      for(const kf of keyFns){
        let av, bv;
        if(kf.i >= 0){ av = a.row[kf.i]; bv = b.row[kf.i]; }
        else {
          const repA = a.g.single || a.g.rows[0] || {};
          const repB = b.g.single || b.g.rows[0] || {};
          av = exprHasAgg(kf.expr) ? evalArithWithAgg(kf.expr, a.g.rows) : evalExpr(kf.expr, repA);
          bv = exprHasAgg(kf.expr) ? evalArithWithAgg(kf.expr, b.g.rows) : evalExpr(kf.expr, repB);
        }
        let cmp;
        if(av == null && bv == null) cmp = 0;
        else if(av == null) cmp = -1;
        else if(bv == null) cmp = 1;
        else if(av < bv) cmp = -1;
        else if(av > bv) cmp = 1;
        else cmp = 0;
        if(kf.dir === 'DESC') cmp = -cmp;
        if(cmp !== 0) return cmp;
      }
      return 0;
    });
    outRows = decorated.map(d => d.row);
  }

  // DISTINCT
  if(stmt.distinct){
    const seen = new Set(); const uniq = [];
    for(const r of outRows){ const k = JSON.stringify(r); if(!seen.has(k)){ seen.add(k); uniq.push(r); } }
    outRows = uniq;
  }

  if(stmt.limit != null) outRows = outRows.slice(0, stmt.limit);

  return {ok:true, type:'select', columns, rows: outRows};
}

function evalArithWithAgg(e, rows){
  if(e.op === 'FUNC' && AGG_FUNCS.has(e.name)) return evalAgg(e, rows);
  if(e.op === 'ARITH'){
    const l = evalArithWithAgg(e.l, rows), r = evalArithWithAgg(e.r, rows);
    if(l==null||r==null) return null;
    switch(e.a){ case '+': return l+r; case '-': return l-r; case '*': return l*r; case '/': return r===0?null:l/r; }
  }
  if(e.op === 'LIT') return e.v;
  return evalExpr(e, rows[0] || {});
}
function evalHaving(e, rows, rep){
  switch(e.op){
    case 'AND': return evalHaving(e.l, rows, rep) && evalHaving(e.r, rows, rep);
    case 'OR': return evalHaving(e.l, rows, rep) || evalHaving(e.r, rows, rep);
    case 'NOT': return !evalHaving(e.e, rows, rep);
    case 'CMP': {
      const l = exprHasAgg(e.l) ? evalArithWithAgg(e.l, rows) : evalExpr(e.l, rep);
      const r = exprHasAgg(e.r) ? evalArithWithAgg(e.r, rows) : evalExpr(e.r, rep);
      if(l==null||r==null) return false;
      switch(e.cmp){ case '=': return l==r; case '!=': return l!=r; case '<': return l<r; case '>': return l>r; case '<=': return l<=r; case '>=': return l>=r; }
      return false;
    }
    default: return !!evalExpr(e, rep);
  }
}
function resolveAliasTableName(stmt, alias){
  const tables = [stmt.from, ...stmt.joins.map(j=>j.table)];
  const t = tables.find(t => (t.alias||t.name).toUpperCase() === alias.toUpperCase());
  return t ? t.name : alias;
}
function rowSampleFor(stmt, db, alias){
  const name = resolveAliasTableName(stmt, alias);
  const {rows} = findTable(db, name);
  return rows[0] || {};
}

function runInsert(stmt, db){
  const {key} = findTable(db, stmt.table);
  const existing = db[key];
  const template = existing[0] || {};
  const allCols = stmt.cols || Object.keys(template);
  let inserted = 0;
  for(const valExprs of stmt.rows){
    if(valExprs.length !== allCols.length) throw new SqlError('Anzahl Werte passt nicht zur Anzahl Spalten');
    const row = {};
    allCols.forEach((c, i) => { row[c] = evalExpr(valExprs[i], {}); });
    existing.push(row);
    inserted++;
  }
  return {ok:true, type:'insert', affected: inserted, db};
}

function runUpdate(stmt, db){
  const {key} = findTable(db, stmt.table);
  const rows = db[key];
  let affected = 0;
  for(const row of rows){
    const env = makeEnvFromRow(key, row);
    let match = true;
    if(stmt.where){ try{ match = evalExpr(stmt.where, env) === true; } catch(e){ match = false; } }
    if(match){
      for(const s of stmt.sets){
        const ck = Object.keys(row).find(k => k.toUpperCase() === s.col.toUpperCase()) || s.col;
        row[ck] = evalExpr(s.val, {});
      }
      affected++;
    }
  }
  return {ok:true, type:'update', affected, db};
}

function runDelete(stmt, db){
  const {key} = findTable(db, stmt.table);
  const rows = db[key];
  const kept = [];
  let affected = 0;
  for(const row of rows){
    const env = makeEnvFromRow(key, row);
    let match = true;
    if(stmt.where){ try{ match = evalExpr(stmt.where, env) === true; } catch(e){ match = false; } }
    if(match) affected++; else kept.push(row);
  }
  db[key] = kept;
  return {ok:true, type:'delete', affected, db};
}

function runCreate(stmt, db){
  const exists = Object.keys(db).some(k => k.toUpperCase() === stmt.table.toUpperCase());
  if(exists) throw new SqlError('Tabelle existiert bereits: '+stmt.table);
  db[stmt.table] = [];
  return {ok:true, type:'create', table: stmt.table, columns: stmt.cols, db};
}

function run(sql, db, opts){
  opts = opts || {};
  const workDb = opts.mutate ? db : cloneDb(db);
  try{
    const stmt = parseSQL(sql);
    let res;
    if(stmt.type === 'select') res = runSelect(stmt, workDb);
    else if(stmt.type === 'insert') res = runInsert(stmt, workDb);
    else if(stmt.type === 'update') res = runUpdate(stmt, workDb);
    else if(stmt.type === 'delete') res = runDelete(stmt, workDb);
    else if(stmt.type === 'create') res = runCreate(stmt, workDb);
    res.stmt = stmt;
    res.dbAfter = workDb;
    return res;
  } catch(err){
    return {ok:false, error: (err && err.message) || String(err)};
  }
}

/* Ergebnisvergleich: Spaltenanzahl + Zeilen (multiset, außer ORDER BY vorgeschrieben) */
function normVal(v){
  if(v == null) return null;
  if(typeof v === 'number') return Math.round(v*1e6)/1e6;
  return String(v);
}
function compareResults(a, b, orderMatters){
  if(!a || !a.ok || !b || !b.ok) return false;
  if(a.type !== b.type) return false;
  if(a.type === 'select'){
    if(a.columns.length !== b.columns.length) return false;
    if(a.rows.length !== b.rows.length) return false;
    const na = a.rows.map(r => r.map(normVal));
    const nb = b.rows.map(r => r.map(normVal));
    if(orderMatters){
      for(let i=0;i<na.length;i++){
        if(JSON.stringify(na[i]) !== JSON.stringify(nb[i])) return false;
      }
      return true;
    }
    const sa = na.map(r=>JSON.stringify(r)).sort();
    const sb = nb.map(r=>JSON.stringify(r)).sort();
    return JSON.stringify(sa) === JSON.stringify(sb);
  }
  return a.affected === b.affected;
}

const SQLEngine = { run, parseSQL, cloneDb, compareResults, SqlError };
if(typeof module !== 'undefined' && module.exports) module.exports = SQLEngine;
else root.SQLEngine = SQLEngine;

})(typeof window !== 'undefined' ? window : globalThis);
