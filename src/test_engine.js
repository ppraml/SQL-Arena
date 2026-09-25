const SQLEngine = require('./sqlengine.js');

const db0 = {
  KUNDE: [
    {kunde_id:1, name:'Anna Berger', ort:'Graz', plz:'8010'},
    {kunde_id:2, name:'Tom Fischer', ort:'Wien', plz:'1010'},
    {kunde_id:3, name:'Lena Huber', ort:'Graz', plz:'8020'},
    {kunde_id:4, name:'Max Novak', ort:'Linz', plz:'4020'},
  ],
  ARTIKEL: [
    {artikel_id:1, bezeichnung:'USB-Kabel', preis:9.90, kategorie:'Zubehör', lagerbestand:50},
    {artikel_id:2, bezeichnung:'Maus', preis:19.90, kategorie:'Zubehör', lagerbestand:30},
    {artikel_id:3, bezeichnung:'Monitor', preis:199.00, kategorie:'Hardware', lagerbestand:5},
    {artikel_id:4, bezeichnung:'Tastatur', preis:39.50, kategorie:'Zubehör', lagerbestand:0},
  ],
  BESTELLUNG: [
    {bestellung_id:1, kunde_id:1, datum:'2026-01-05', status:'geliefert'},
    {bestellung_id:2, kunde_id:2, datum:'2026-01-06', status:'offen'},
    {bestellung_id:3, kunde_id:1, datum:'2026-02-01', status:'offen'},
  ],
  BESTELLPOSITION: [
    {bestellung_id:1, artikel_id:1, menge:2},
    {bestellung_id:1, artikel_id:3, menge:1},
    {bestellung_id:2, artikel_id:2, menge:3},
    {bestellung_id:3, artikel_id:4, menge:1},
  ],
};

let pass=0, fail=0;
function check(name, cond, extra){
  if(cond){ pass++; }
  else { fail++; console.log('FAIL:', name, extra||''); }
}

// 1. Simple select
let r = SQLEngine.run("SELECT name, ort FROM KUNDE WHERE ort = 'Graz'", db0);
check('simple where', r.ok && r.rows.length===2, JSON.stringify(r));

// 2. Order by + limit
r = SQLEngine.run("SELECT bezeichnung, preis FROM ARTIKEL ORDER BY preis DESC LIMIT 2", db0);
check('order desc limit', r.ok && r.rows[0][0]==='Monitor' && r.rows.length===2, JSON.stringify(r));

// 3. JOIN
r = SQLEngine.run("SELECT k.name, b.datum FROM KUNDE k JOIN BESTELLUNG b ON k.kunde_id = b.kunde_id", db0);
check('inner join', r.ok && r.rows.length===3, JSON.stringify(r));

// 4. LEFT JOIN (customer with no orders should appear)
r = SQLEngine.run("SELECT k.name, b.bestellung_id FROM KUNDE k LEFT JOIN BESTELLUNG b ON k.kunde_id=b.kunde_id WHERE k.name='Max Novak'", db0);
check('left join null', r.ok && r.rows.length===1 && r.rows[0][1]===null, JSON.stringify(r));

// 5. Multi join + group by + aggregate
r = SQLEngine.run(`SELECT k.name, SUM(bp.menge * a.preis) AS summe
  FROM KUNDE k
  JOIN BESTELLUNG b ON k.kunde_id=b.kunde_id
  JOIN BESTELLPOSITION bp ON b.bestellung_id=bp.bestellung_id
  JOIN ARTIKEL a ON bp.artikel_id=a.artikel_id
  GROUP BY k.name
  ORDER BY summe DESC`, db0);
check('multijoin group agg', r.ok, JSON.stringify(r));
if(r.ok){
  const anna = r.rows.find(x=>x[0]==='Anna Berger');
  check('anna summe', Math.abs(anna[1]-(2*9.90+1*199.00+1*39.50))<0.001, JSON.stringify(anna));
}

// 6. COUNT/HAVING
r = SQLEngine.run("SELECT kategorie, COUNT(*) AS anz FROM ARTIKEL GROUP BY kategorie HAVING COUNT(*) > 1", db0);
check('having', r.ok && r.rows.length===1 && r.rows[0][0]==='Zubehör' && r.rows[0][1]===3, JSON.stringify(r));

// 7. DISTINCT
r = SQLEngine.run("SELECT DISTINCT ort FROM KUNDE", db0);
check('distinct', r.ok && r.rows.length===3, JSON.stringify(r));

// 8. LIKE
r = SQLEngine.run("SELECT name FROM KUNDE WHERE name LIKE '%Berger'", db0);
check('like', r.ok && r.rows.length===1 && r.rows[0][0]==='Anna Berger', JSON.stringify(r));

// 9. IN
r = SQLEngine.run("SELECT bezeichnung FROM ARTIKEL WHERE kategorie IN ('Hardware')", db0);
check('in', r.ok && r.rows.length===1, JSON.stringify(r));

// 10. SELECT *
r = SQLEngine.run("SELECT * FROM KUNDE WHERE kunde_id=1", db0);
check('star', r.ok && r.columns.length===4 && r.rows[0][1]==='Anna Berger', JSON.stringify(r));

// 11. INSERT
{
  const db = SQLEngine.cloneDb(db0);
  r = SQLEngine.run("INSERT INTO KUNDE (kunde_id, name, ort, plz) VALUES (5, 'Nina Kogler', 'Graz', '8010')", db, {mutate:true});
  check('insert', r.ok && r.affected===1 && db.KUNDE.length===5, JSON.stringify(r));
}

// 12. UPDATE
{
  const db = SQLEngine.cloneDb(db0);
  r = SQLEngine.run("UPDATE ARTIKEL SET preis = 24.90 WHERE bezeichnung = 'Maus'", db, {mutate:true});
  check('update', r.ok && r.affected===1 && db.ARTIKEL.find(a=>a.bezeichnung==='Maus').preis===24.90, JSON.stringify(r));
}

// 13. DELETE
{
  const db = SQLEngine.cloneDb(db0);
  r = SQLEngine.run("DELETE FROM ARTIKEL WHERE lagerbestand = 0", db, {mutate:true});
  check('delete', r.ok && r.affected===1 && db.ARTIKEL.length===3, JSON.stringify(r));
}

// 14. Compare results (order-insensitive)
{
  const a = SQLEngine.run("SELECT name FROM KUNDE WHERE ort='Graz'", db0);
  const b = SQLEngine.run("SELECT name FROM KUNDE WHERE ort='Graz' ORDER BY kunde_id DESC", db0);
  check('compare unordered equal', SQLEngine.compareResults(a,b,false));
}

// 15. Error handling
r = SQLEngine.run("SELECT FRO KUNDE", db0);
check('parse error caught', r.ok === false, JSON.stringify(r));

r = SQLEngine.run("SELECT * FROM NICHT_EXISTIEREND", db0);
check('unknown table error', r.ok === false, JSON.stringify(r));

// 16. CREATE TABLE
{
  const db = SQLEngine.cloneDb(db0);
  r = SQLEngine.run("CREATE TABLE MITARBEITER (mitarbeiter_id INT PRIMARY KEY, name VARCHAR(50) NOT NULL, gehalt DECIMAL)", db, {mutate:true});
  check('create table', r.ok && Array.isArray(db.MITARBEITER), JSON.stringify(r));
}

// 17. Arithmetic in select without agg
r = SQLEngine.run("SELECT bezeichnung, preis * 1.2 AS mit_steuer FROM ARTIKEL WHERE artikel_id=1", db0);
check('arith', r.ok && Math.abs(r.rows[0][1]-11.88)<0.001, JSON.stringify(r));

// 18. NATURAL-like (using same col names) with USING not supported explicitly but ON works
r = SQLEngine.run("SELECT a.bezeichnung, bp.menge FROM ARTIKEL a JOIN BESTELLPOSITION bp ON a.artikel_id = bp.artikel_id WHERE bp.bestellung_id=1", db0);
check('join filtered', r.ok && r.rows.length===2, JSON.stringify(r));

// 19. JOIN ... USING(col)
r = SQLEngine.run("SELECT bestellung_id, menge FROM BESTELLUNG JOIN BESTELLPOSITION USING(bestellung_id) WHERE bestellung_id=1", db0);
check('join using', r.ok && r.rows.length===2, JSON.stringify(r));

// 20. NATURAL JOIN
r = SQLEngine.run("SELECT bestellung_id, artikel_id FROM BESTELLUNG NATURAL JOIN BESTELLPOSITION", db0);
check('natural join', r.ok && r.rows.length===4, JSON.stringify(r));

// 21. UNION
r = SQLEngine.run("SELECT ort FROM KUNDE WHERE ort='Graz' UNION SELECT ort FROM KUNDE WHERE ort='Wien'", db0);
check('union', r.ok && r.rows.length===2, JSON.stringify(r));

// 22. UNION ALL (behält Duplikate)
r = SQLEngine.run("SELECT ort FROM KUNDE WHERE ort='Graz' UNION ALL SELECT ort FROM KUNDE WHERE ort='Graz'", db0);
check('union all', r.ok && r.rows.length===4, JSON.stringify(r));

// 23. INTERSECT
r = SQLEngine.run("SELECT kunde_id FROM KUNDE WHERE ort='Graz' INTERSECT SELECT kunde_id FROM BESTELLUNG", db0);
check('intersect', r.ok && r.rows.length===1 && r.rows[0][0]===1, JSON.stringify(r));

// 24. EXCEPT
r = SQLEngine.run("SELECT kunde_id FROM KUNDE EXCEPT SELECT kunde_id FROM BESTELLUNG", db0);
check('except', r.ok && r.rows.length===2, JSON.stringify(r));

// 25. IN-Subquery
r = SQLEngine.run("SELECT name FROM KUNDE WHERE kunde_id IN (SELECT kunde_id FROM BESTELLUNG WHERE status='offen')", db0);
check('in subquery', r.ok && r.rows.length===2, JSON.stringify(r));

// 26. Korrelierte EXISTS-Subquery
r = SQLEngine.run("SELECT name FROM KUNDE k WHERE EXISTS (SELECT 1 FROM BESTELLUNG b WHERE b.kunde_id=k.kunde_id AND b.status='offen')", db0);
check('exists correlated', r.ok && r.rows.length===2, JSON.stringify(r));

// 27. NOT EXISTS
r = SQLEngine.run("SELECT name FROM KUNDE k WHERE NOT EXISTS (SELECT 1 FROM BESTELLUNG b WHERE b.kunde_id=k.kunde_id)", db0);
check('not exists', r.ok && r.rows.length===2, JSON.stringify(r));

// 28. Skalare Subquery im Vergleich
r = SQLEngine.run("SELECT bezeichnung FROM ARTIKEL WHERE preis > (SELECT AVG(preis) FROM ARTIKEL)", db0);
check('scalar subquery', r.ok && r.rows.length===1 && r.rows[0][0]==='Monitor', JSON.stringify(r));

// 29. CREATE VIEW + Nutzung
{
  const db = SQLEngine.cloneDb(db0);
  let rv = SQLEngine.run("CREATE VIEW GRAZ_KUNDEN AS SELECT kunde_id, name FROM KUNDE WHERE ort='Graz'", db, {mutate:true});
  check('create view', rv.ok, JSON.stringify(rv));
  rv = SQLEngine.run("SELECT name FROM GRAZ_KUNDEN ORDER BY name", db, {mutate:true});
  check('select from view', rv.ok && rv.rows.length===2, JSON.stringify(rv));
  rv = SQLEngine.run("DELETE FROM GRAZ_KUNDEN", db, {mutate:true});
  check('view is read-only', rv.ok === false, JSON.stringify(rv));
}

// 30. ALTER TABLE ADD COLUMN
{
  const db = SQLEngine.cloneDb(db0);
  let ra = SQLEngine.run("ALTER TABLE KUNDE ADD COLUMN land VARCHAR(50) DEFAULT 'AT'", db, {mutate:true});
  check('alter table add column', ra.ok, JSON.stringify(ra));
  ra = SQLEngine.run("SELECT land FROM KUNDE WHERE kunde_id=1", db, {mutate:true});
  check('alter default value applied', ra.ok && ra.rows[0][0]==='AT', JSON.stringify(ra));
}

// 31. DROP TABLE
{
  const db = SQLEngine.cloneDb(db0);
  let rd = SQLEngine.run("DROP TABLE BESTELLPOSITION", db, {mutate:true});
  check('drop table', rd.ok, JSON.stringify(rd));
  rd = SQLEngine.run("SELECT * FROM BESTELLPOSITION", db, {mutate:true});
  check('table gone after drop', rd.ok === false, JSON.stringify(rd));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
