-- Empreinte de la structure (sans données) : identique en production et
-- dans une base reconstruite depuis 20261116_baseline.sql.
with f as (
 select p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as l
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) x
 where n.nspname='public' and x.privilege_type='EXECUTE' and (x.grantee=0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role'))
), t as (
 select c.relname||':'||case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end||':'||x.privilege_type as l
 from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(coalesce(c.relacl, acldefault(case when c.relkind='S' then 's' else 'r' end::"char",c.relowner))) x
 where n.nspname='public' and c.relkind in ('r','S') and (x.grantee=0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role'))
), s as (
 select c.relname||':'||con.conname||':'||pg_get_constraintdef(con.oid) l from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 union all select ci.relname||':'||pg_get_indexdef(i.indexrelid) from pg_index i join pg_class ci on ci.oid=i.indexrelid join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 union all select c.relname||'.'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||':'||a.attidentity::text from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped
 union all select c.relname||':rls='||c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
 union all select t.tgname||':'||pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
), fn as (
 select p.proname||':'||md5(pg_get_functiondef(p.oid)) l from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
)
select 'functions' k, count(*)::int n, md5(string_agg(l,'|' order by l)) h from fn
union all select 'func_grants', count(*)::int, md5(string_agg(l,'|' order by l)) from f
union all select 'table_grants', count(*)::int, md5(string_agg(l,'|' order by l)) from t
union all select 'structure', count(*)::int, md5(string_agg(l,'|' order by l)) from s
order by 1;
