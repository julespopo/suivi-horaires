// Rejoue supabase/schema/20261116_baseline.sql sur une base PostgreSQL vide (PGlite)
// et vérifie que la structure obtenue est identique à la production du 16/11/2026,
// puis fait un parcours complet salarié + Pilotage avec des données fictives.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');

// Empreintes relevées en production avec supabase/schema/fingerprint.sql (26/11/2026, après la purge),
// identiques à « baseline du 16/11 + migrations postérieures » rejouées ci-dessous.
const PRODUCTION = {
  functions: { n: 74, h: '7f40e20ea8b8aecbb7fdef4954e99ed9' },
  func_grants: { n: 139, h: '8746091d251a469873b7a7cef7d607e6' },
  table_grants: { n: 76, h: '1e014fe1a493ee0d5d850f514309fdae' },
  structure: { n: 255, h: '66165007143f06eae52c3f2d159105a6' }
};

// Ce que Supabase fournit d'office : rôles et extensions (pgcrypto simulé, PGlite ne l'a pas).
const SUPABASE_STUBS = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions;
CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'select pg_catalog.gen_random_uuid()';
CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'select sha256(convert_to($1,''UTF8''))';
CREATE FUNCTION extensions.gen_random_bytes(int) RETURNS bytea LANGUAGE sql AS 'select substring(sha256(convert_to(random()::text||clock_timestamp()::text,''UTF8'')) from 1 for $1)';
CREATE FUNCTION extensions.gen_salt(text) RETURNS text LANGUAGE sql AS 'select ''$fixture$''';
CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql IMMUTABLE AS 'select ''$fixture$''||md5($1)';
`;

const baseline = fs.readFileSync('supabase/schema/20261116_baseline.sql', 'utf8');
const portable = baseline.replace(
  /-- \[supabase-only:start\][\s\S]*?-- \[supabase-only:end\]/g,
  ''
);
const forbidden = [
  /sb_secret_/i,
  /sb_publishable_/i,
  /service_role_key/i,
  /eyJhbGciOi/,
  /\$2[aby]\$\d\d\$/,
  /[a-z0-9]{20}\.supabase\.co/i
];
for (const re of forbidden)
  assert.ok(!re.test(baseline), `Contenu interdit dans la baseline : ${re}`);
// Hors du code des fonctions, aucune instruction ne doit écrire de données.
const outsideBodies = baseline
  .replace(/\$function\$[\s\S]*?\$function\$/g, '')
  .replace(/\$cron\$[\s\S]*?\$cron\$/g, '');
assert.ok(
  !/^\s*(INSERT|COPY|UPDATE)\b/im.test(outsideBodies),
  'Instruction de données hors des fonctions'
);
console.log('✓ Aucune donnée ni secret dans la baseline');

const db = new PGlite();
await db.exec(SUPABASE_STUBS);
await db.exec(portable);
console.log('✓ Baseline rejouée sur une base vide');
// Puis, dans l'ordre, les migrations ajoutées après l'instantané du 16/11/2026.
const laterMigrations = fs
  .readdirSync('supabase/migrations')
  .filter(f => /^\d{8}/.test(f) && f.slice(0, 8) > '20261116' && f.endsWith('.sql'))
  .sort();
for (const f of laterMigrations) await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
console.log(`✓ ${laterMigrations.length} migration(s) postérieure(s) rejouée(s)`);
if (process.env.PRINT_FINGERPRINT)
  console.log(
    JSON.stringify(
      (await db.query(fs.readFileSync('supabase/schema/fingerprint.sql', 'utf8'))).rows
    )
  );

const rows = (await db.query(fs.readFileSync('supabase/schema/fingerprint.sql', 'utf8'))).rows;
for (const r of rows) {
  assert.deepEqual(
    { n: r.n, h: r.h },
    PRODUCTION[r.k],
    `Empreinte « ${r.k} » différente de la production`
  );
  console.log(`✓ ${r.k} identiques à la production (${r.n})`);
}

// Parcours fictif : connexion salarié, journée en deux créneaux, validation Pilotage.
const EMP = '00000000-0000-0000-0000-0000000000e1',
  BOSS = '00000000-0000-0000-0000-0000000000b1';
await db.exec(`
 INSERT INTO public.employees(id,name,link_token,pin_hash) VALUES('${EMP}','Salarié fictif','lien-fictif',extensions.crypt('1234',extensions.gen_salt('bf')));
 INSERT INTO public.owner_accounts(id,link_token,pin_hash) VALUES('${BOSS}','pilotage-fictif',extensions.crypt('9999',extensions.gen_salt('bf')));
 INSERT INTO public.employers(id,name) VALUES('00000000-0000-0000-0000-0000000000f1','Employeur fictif');
 INSERT INTO public.employee_employers(employee_id,employer_id) VALUES('${EMP}','00000000-0000-0000-0000-0000000000f1');`);
const one = async (sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
assert.equal(
  (await one(`select public.api_employee_login('lien-fictif','0000')`)).error,
  'invalid_credentials'
);
const login = await one(`select public.api_employee_login('lien-fictif','1234')`);
assert.ok(login.session_token, 'connexion salarié');
const tok = login.session_token,
  day = '2026-11-17',
  er = '00000000-0000-0000-0000-0000000000f1';
const s1 = await one(`select public.api_employee_start_segment($1,$2,$3,'08:00')`, [tok, day, er]);
await one(`select public.api_employee_stop_segment($1,$2,'12:00')`, [tok, s1]);
const s2 = await one(`select public.api_employee_start_segment_manual($1,$2,$3,'13:00')`, [
  tok,
  day,
  er
]);
await one(`select public.api_employee_stop_segment_manual($1,$2,'17:30')`, [tok, s2]);
const data = await one(`select public.api_employee_v2_data($1,$2,$3)`, [tok, day, day]);
assert.equal(data.segments.length, 2);
console.log('✓ Salarié : connexion par PIN, deux créneaux saisis');
const owner = await one(`select public.api_owner_login('pilotage-fictif','9999')`);
assert.ok(owner.session_token, 'connexion Pilotage');
await one(`select public.api_owner_validate_entry($1,$2,$3)`, [owner.session_token, EMP, day]);
const entry = (
  await db.query(
    `select arrival::text,departure::text,validation_status from public.work_entries where employee_id=$1 and work_date=$2`,
    [EMP, day]
  )
).rows[0];
assert.deepEqual(entry, {
  arrival: '08:00:00',
  departure: '17:30:00',
  validation_status: 'validated'
});
console.log('✓ Pilotage : connexion et validation de la journée');
await assert.rejects(
  () => db.query(`select public.api_owner_data($1,$2,$3)`, [tok, day, day]),
  /unauthorized/
);
console.log('✓ Un salarié ne peut pas lire les données Pilotage');

// Reports du compte temps (saisis par le Pilotage).
const ownerTok = owner.session_token;
await one(`select public.api_owner_set_compte_temps_report($1,$2,'2026-11-01',354,'Report')`, [
  ownerTok,
  EMP
]);
await one(`select public.api_owner_set_compte_temps_report($1,$2,'2026-11-01',-90,'Corrigé')`, [
  ownerTok,
  EMP
]);
let reports = await one(`select public.api_owner_compte_temps_reports($1)`, [ownerTok]);
assert.deepEqual(reports, [
  { employee_id: EMP, effective_date: '2026-11-01', minutes: -90, note: 'Corrigé' }
]);
await one(`select public.api_owner_set_compte_temps_report($1,$2,'2026-11-01',0,'')`, [
  ownerTok,
  EMP
]);
reports = await one(`select public.api_owner_compte_temps_reports($1)`, [ownerTok]);
assert.deepEqual(reports, []);
console.log('✓ Report du compte temps : création, modification, suppression');
await assert.rejects(
  () => db.query(`select public.api_owner_compte_temps_reports($1)`, [tok]),
  /unauthorized/
);
await assert.rejects(
  () =>
    db.query(`select public.api_owner_set_compte_temps_report($1,$2,'2026-11-01',60,'')`, [
      tok,
      EMP
    ]),
  /unauthorized/
);
for (const role of ['anon', 'authenticated'])
  assert.equal(
    (
      await db.query(
        `select has_table_privilege('${role}','public.compte_temps_reports','SELECT') ok`
      )
    ).rows[0].ok,
    false
  );
console.log('✓ Reports : réservés au Pilotage, table inaccessible depuis le navigateur');

// Comptes « consultation » : lecture comme le Pilotage, aucune modification.
assert.equal(
  (await one(`select public.api_owner_data($1,$2,$3)`, [ownerTok, day, day])).access,
  'admin'
);
const created = await one(`select public.api_owner_create_viewer($1,'Comptable','4321')`, [
  ownerTok
]);
assert.ok(created.id && /^[0-9a-f]{48}$/.test(created.link_token), 'lien du compte consultation');
await assert.rejects(
  () => db.query(`select public.api_owner_create_viewer($1,'X','12')`, [ownerTok]),
  /invalid_label|invalid_new_pin/
);
assert.equal(
  (await one(`select public.api_owner_login($1,'0000')`, [created.link_token])).error,
  'invalid_credentials'
);
const viewerTok = (await one(`select public.api_owner_login($1,'4321')`, [created.link_token]))
  .session_token;
assert.ok(viewerTok, 'connexion du compte consultation');
const viewerData = await one(`select public.api_owner_data($1,$2,$3)`, [viewerTok, day, day]);
assert.equal(viewerData.access, 'viewer');
assert.equal(viewerData.entries.length, 1);
assert.equal(
  (await one(`select public.api_owner_v2_data($1,$2,$3)`, [viewerTok, day, day])).segments.length,
  2
);
assert.deepEqual(await one(`select public.api_owner_compte_temps_reports($1)`, [viewerTok]), []);
assert.equal(
  await one(`select public.api_owner_push_subscription_status($1,'https://push.invalid/x')`, [
    viewerTok
  ]),
  false
);
console.log('✓ Consultation : lit les mêmes données que le Pilotage');
const ER = '00000000-0000-0000-0000-0000000000f1';
const writes = [
  [`select public.api_owner_validate_entry($1,$2,$3)`, [viewerTok, EMP, day]],
  [`select public.api_owner_set_schedule($1,$2,$3,true,'')`, [viewerTok, EMP, day]],
  [
    `select public.api_owner_save_entry($1,$2,$3,'worked','08:00','12:00',0,'','validated')`,
    [viewerTok, EMP, day]
  ],
  [
    `select public.api_owner_replace_day_v2($1,$2,$3,'[]'::jsonb,0,'','validated')`,
    [viewerTok, EMP, day]
  ],
  [`select public.api_owner_set_day_off_v2($1,$2,$3,true,'validated')`, [viewerTok, EMP, day]],
  [`select public.api_owner_create_employer($1,'Nouvel employeur')`, [viewerTok]],
  [`select public.api_owner_set_employer_active($1,$2,false)`, [viewerTok, ER]],
  [`select public.api_owner_set_employee_employer($1,$2,$3,false)`, [viewerTok, EMP, ER]],
  [`select public.api_owner_set_employee_settings($1,$2,0,0)`, [viewerTok, EMP]],
  [
    `select public.api_owner_create_leave_typed($1,$2,'2026-12-01','2026-12-01','','rtt')`,
    [viewerTok, EMP]
  ],
  [`select public.api_owner_create_leave($1,$2,'2026-12-01','2026-12-01','')`, [viewerTok, EMP]],
  [`select public.api_owner_review_leave($1,gen_random_uuid(),'validated')`, [viewerTok]],
  [`select public.api_owner_delete_leave($1,gen_random_uuid())`, [viewerTok]],
  [`select public.api_owner_set_compte_temps_report($1,$2,'2026-11-01',60,'')`, [viewerTok, EMP]],
  [`select public.api_owner_viewers($1)`, [viewerTok]],
  [`select public.api_owner_create_viewer($1,'Autre','1111')`, [viewerTok]],
  [`select public.api_owner_set_viewer_active($1,$2,false)`, [viewerTok, created.id]]
];
for (const [sql, params] of writes)
  await assert.rejects(() => db.query(sql, params), /read_only/, sql);
const after = (
  await db.query(
    `select validation_status from public.work_entries where employee_id=$1 and work_date=$2`,
    [EMP, day]
  )
).rows[0];
assert.equal(after.validation_status, 'validated');
console.log(`✓ Consultation : les ${writes.length} fonctions de modification refusent (read_only)`);
assert.equal(
  (await one(`select public.api_owner_change_pin($1,'4321','5678')`, [viewerTok])).ok,
  true
);
console.log('✓ Consultation : peut changer son propre PIN');
const viewers = await one(`select public.api_owner_viewers($1)`, [ownerTok]);
assert.deepEqual(
  viewers.map(v => [v.label, v.active]),
  [['Comptable', true]]
);
await one(`select public.api_owner_set_viewer_active($1,$2,false)`, [ownerTok, created.id]);
await assert.rejects(
  () => db.query(`select public.api_owner_data($1,$2,$3)`, [viewerTok, day, day]),
  /unauthorized/
);
assert.equal(
  (await one(`select public.api_owner_login($1,'5678')`, [created.link_token])).error,
  'invalid_credentials'
);
await assert.rejects(
  () => db.query(`select public.api_owner_set_viewer_active($1,$2,false)`, [ownerTok, BOSS]),
  /viewer_not_found/
);
console.log(
  '✓ Consultation : désactivé par l’admin, accès coupé immédiatement ; un admin ne peut pas être désactivé ainsi'
);

// Durées de conservation : rien n'est supprimé avant 3 ans après la fin de la période
// de compte temps ; ensuite les heures, créneaux, congés et reports partent.
const countHours = async () =>
  Number(
    await one(
      `select (select count(*) from public.work_segments where employee_id=$1)
        + (select count(*) from public.work_entries where employee_id=$1)
        + (select count(*) from public.compte_temps_reports where employee_id=$1)`,
      [EMP]
    )
  );
const before = await countHours();
assert.ok(before >= 3, 'données fictives présentes');
const early = await one(`select public._purge_expired_data('2030-04-30')`);
assert.equal(early.hours_cutoff, '2026-05-01');
assert.equal(await countHours(), before);
console.log('✓ Conservation : au 30/04/2030, les heures de 2026-2027 sont encore conservées');
const late = await one(`select public._purge_expired_data('2030-05-02')`);
assert.equal(late.hours_cutoff, '2027-05-01');
assert.equal(await countHours(), 0);
assert.ok(late.work_segments >= 2 && late.work_entries >= 1);
console.log('✓ Conservation : au 02/05/2030, les heures de la période 2026-2027 sont supprimées');
await db.exec('set role anon');
await assert.rejects(() => db.query(`select public._purge_expired_data()`), /permission denied/);
await db.exec('reset role');
console.log('✓ Conservation : la purge n’est pas appelable depuis le navigateur');
await db.close();
