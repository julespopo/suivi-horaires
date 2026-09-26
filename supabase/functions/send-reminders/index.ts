import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth:{persistSession:false}});

function parisNow(){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:`${v.year}-${v.month}-${v.day}`, hour:Number(v.hour), minute:Number(v.minute)};
}

Deno.serve(async (req) => {
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  if(req.headers.get("x-cron-secret")!==CRON_SECRET) return new Response("Unauthorized",{status:401});

  let body:any={}; try{body=await req.json()}catch{}
  const now=parisNow();
  const force=body?.force===true;
  if(!force && now.hour!==19){
    return Response.json({ok:true,skipped:true,reason:"not_19h_paris",paris_time:now});
  }

  const {data:batch,error:batchError}=await supabase.rpc("system_get_reminder_batch",{p_work_date:now.date});
  if(batchError) return Response.json({ok:false,error:batchError.message},{status:500});

  let sent=0, skipped=0, failed=0;
  for(const employee of (batch||[])){
    const subscriptions=Array.isArray(employee.subscriptions)?employee.subscriptions:[];
    if(!subscriptions.length){skipped++;continue}
    let employeeSent=false;
    for(const sub of subscriptions){
      try{
        await webpush.sendNotification(
          {endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},
          JSON.stringify({
            title:"Mes horaires",
            body:"Ta journée d’aujourd’hui n’est pas encore complète. Pense à renseigner ton heure de départ ou à compléter tes horaires.",
            tag:`hours-${now.date}`,
            url:"./"
          }),
          {TTL:60*60*3,urgency:"normal"}
        );
        employeeSent=true;sent++;
        await supabase.rpc("system_mark_push_success",{p_endpoint:sub.endpoint});
      }catch(err:any){
        failed++;
        const status=Number(err?.statusCode||err?.status||0);
        if(status===404||status===410){
          await supabase.rpc("system_deactivate_push_subscription",{p_endpoint:sub.endpoint});
        }
        console.error("Push failed",employee.name,status,err?.message||err);
      }
    }
    if(employeeSent){
      await supabase.rpc("system_record_reminder_success",{p_employee_id:employee.employee_id,p_work_date:now.date});
    }
  }

  return Response.json({ok:true,date:now.date,force,employees:(batch||[]).length,sent,skipped,failed});
});
