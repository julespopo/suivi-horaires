// Vérifie qu'une sauvegarde est restaurable, sans toucher à Supabase :
// recharge la structure (baseline) puis les données dans une base PostgreSQL
// vide en mémoire, et affiche le nombre de lignes par table.
//
//   node scripts/backup/verifier-sauvegarde.mjs "<chemin>/suivi-horaires_AAAA-MM-JJ_HHMM.sql.gz"
//
// N'affiche aucune donnée, seulement des comptes.
import fs from 'node:fs';
import zlib from 'node:zlib';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');

const file=process.argv[2];
if(!file){console.error('Usage : node scripts/backup/verifier-sauvegarde.mjs <sauvegarde.sql.gz>');process.exit(2)}
const dump=zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')
  .split('\n').filter(line=>!/^\\(un)?restrict\b/.test(line)).join('\n');

const STUBS=`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions;
CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'select pg_catalog.gen_random_uuid()';
CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'select sha256(convert_to($1,''UTF8''))';
CREATE FUNCTION extensions.gen_random_bytes(int) RETURNS bytea LANGUAGE sql AS 'select substring(sha256(convert_to(random()::text,''UTF8'')) from 1 for $1)';
CREATE FUNCTION extensions.gen_salt(text) RETURNS text LANGUAGE sql AS 'select ''x''';
CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql AS 'select md5($1)';
`;
const baseline=fs.readFileSync(new URL('../../supabase/schema/20261116_baseline.sql',import.meta.url),'utf8')
  .replace(/-- \[supabase-only:start\][\s\S]*?-- \[supabase-only:end\]/g,'');

const db=new PGlite();
await db.exec(STUBS);
await db.exec(baseline);
await db.exec(dump);
const {rows}=await db.query(`select relname as t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' order by 1`);
// Empreinte du contenu de chaque table (comparable avec la même requête en production,
// voir supabase/schema/README.md) : nombre de lignes + md5 des lignes triées.
await db.exec(`SET TimeZone='UTC'`);
const result={};
for(const {t} of rows)result[t]=(await db.query(`select count(*)::int n, coalesce(md5(string_agg(x::text,'|' order by x::text)),'-') h from public.${t} x`)).rows[0];
console.log(Object.entries(result).map(([t,r])=>`${t.padEnd(26)} ${String(r.n).padStart(5)}  ${r.h}`).join('\n'));
console.log('✓ Sauvegarde restaurée sans erreur dans une base vide');
await db.close();
