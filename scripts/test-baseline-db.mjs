// Rejoue supabase/schema/20261116_baseline.sql sur une base PostgreSQL vide (PGlite)
// et vérifie que la structure obtenue est identique à la production du 16/11/2026,
// puis fait un parcours complet salarié + Pilotage avec des données fictives.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');

// Empreintes relevées en production avec supabase/schema/fingerprint.sql (16/11/2026).
const PRODUCTION={
  functions:{n:67,h:'dfcae2cee89df7677e8b973af8c51a5c'},
  func_grants:{n:128,h:'11f81e0937eb189e960f1629d88ea147'},
  table_grants:{n:76,h:'1e014fe1a493ee0d5d850f514309fdae'},
  structure:{n:243,h:'2b50d8a97436a65bd7762f9ed8c05d44'}
};

// Ce que Supabase fournit d'office : rôles et extensions (pgcrypto simulé, PGlite ne l'a pas).
const SUPABASE_STUBS=`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions;
CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'select pg_catalog.gen_random_uuid()';
CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'select sha256(convert_to($1,''UTF8''))';
CREATE FUNCTION extensions.gen_random_bytes(int) RETURNS bytea LANGUAGE sql AS 'select substring(sha256(convert_to(random()::text||clock_timestamp()::text,''UTF8'')) from 1 for $1)';
CREATE FUNCTION extensions.gen_salt(text) RETURNS text LANGUAGE sql AS 'select ''$fixture$''';
CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql IMMUTABLE AS 'select ''$fixture$''||md5($1)';
`;

const baseline=fs.readFileSync('supabase/schema/20261116_baseline.sql','utf8');
const portable=baseline.replace(/-- \[supabase-only:start\][\s\S]*?-- \[supabase-only:end\]/g,'');
const forbidden=[/sb_secret_/i,/sb_publishable_/i,/service_role_key/i,/eyJhbGciOi/,/\$2[aby]\$\d\d\$/,/[a-z0-9]{20}\.supabase\.co/i];
for(const re of forbidden)assert.ok(!re.test(baseline),`Contenu interdit dans la baseline : ${re}`);
// Hors du code des fonctions, aucune instruction ne doit écrire de données.
const outsideBodies=baseline.replace(/\$function\$[\s\S]*?\$function\$/g,'').replace(/\$cron\$[\s\S]*?\$cron\$/g,'');
assert.ok(!/^\s*(INSERT|COPY|UPDATE)\b/im.test(outsideBodies),'Instruction de données hors des fonctions');
console.log('✓ Aucune donnée ni secret dans la baseline');

const db=new PGlite();
await db.exec(SUPABASE_STUBS);
await db.exec(portable);
console.log('✓ Baseline rejouée sur une base vide');

const rows=(await db.query(fs.readFileSync('supabase/schema/fingerprint.sql','utf8'))).rows;
for(const r of rows){
  assert.deepEqual({n:r.n,h:r.h},PRODUCTION[r.k],`Empreinte « ${r.k} » différente de la production`);
  console.log(`✓ ${r.k} identiques à la production (${r.n})`);
}

// Parcours fictif : connexion salarié, journée en deux créneaux, validation Pilotage.
const EMP='00000000-0000-0000-0000-0000000000e1',BOSS='00000000-0000-0000-0000-0000000000b1';
await db.exec(`
 INSERT INTO public.employees(id,name,link_token,pin_hash) VALUES('${EMP}','Salarié fictif','lien-fictif',extensions.crypt('1234',extensions.gen_salt('bf')));
 INSERT INTO public.owner_accounts(id,link_token,pin_hash) VALUES('${BOSS}','pilotage-fictif',extensions.crypt('9999',extensions.gen_salt('bf')));
 INSERT INTO public.employers(id,name) VALUES('00000000-0000-0000-0000-0000000000f1','Employeur fictif');
 INSERT INTO public.employee_employers(employee_id,employer_id) VALUES('${EMP}','00000000-0000-0000-0000-0000000000f1');`);
const one=async(sql,params)=>Object.values((await db.query(sql,params)).rows[0])[0];
assert.equal((await one(`select public.api_employee_login('lien-fictif','0000')`)).error,'invalid_credentials');
const login=await one(`select public.api_employee_login('lien-fictif','1234')`);
assert.ok(login.session_token,'connexion salarié');
const tok=login.session_token,day='2026-11-17',er='00000000-0000-0000-0000-0000000000f1';
const s1=await one(`select public.api_employee_start_segment($1,$2,$3,'08:00')`,[tok,day,er]);
await one(`select public.api_employee_stop_segment($1,$2,'12:00')`,[tok,s1]);
const s2=await one(`select public.api_employee_start_segment_manual($1,$2,$3,'13:00')`,[tok,day,er]);
await one(`select public.api_employee_stop_segment_manual($1,$2,'17:30')`,[tok,s2]);
const data=await one(`select public.api_employee_v2_data($1,$2,$3)`,[tok,day,day]);
assert.equal(data.segments.length,2);
console.log('✓ Salarié : connexion par PIN, deux créneaux saisis');
const owner=await one(`select public.api_owner_login('pilotage-fictif','9999')`);
assert.ok(owner.session_token,'connexion Pilotage');
await one(`select public.api_owner_validate_entry($1,$2,$3)`,[owner.session_token,EMP,day]);
const entry=(await db.query(`select arrival::text,departure::text,validation_status from public.work_entries where employee_id=$1 and work_date=$2`,[EMP,day])).rows[0];
assert.deepEqual(entry,{arrival:'08:00:00',departure:'17:30:00',validation_status:'validated'});
console.log('✓ Pilotage : connexion et validation de la journée');
await assert.rejects(()=>db.query(`select public.api_owner_data($1,$2,$3)`,[tok,day,day]),/unauthorized/);
console.log('✓ Un salarié ne peut pas lire les données Pilotage');
await db.close();
