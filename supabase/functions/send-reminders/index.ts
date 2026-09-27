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
  return {date:`${v.year}-${v.month}-${v.day}`,hour:Number(v.hour),minute:Number(v.minute)};
}

function defaultWorkingDay(date:string){
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

function ownerSummaryBody(completed:number, planned:number, incompleteNames:string[]){
  if(completed>=planned) return `${completed}/${planned} employés ont complété leur journée.`;
  if(incompleteNames.length){
    const suffix=incompleteNames.length===1?"reste":"restent";
    return `${completed}/${planned} employés ont complété leur journée — ${incompleteNames.join(", ")} ${suffix} à renseigner.`;
  }
  const remaining=Math.max(0,planned-completed);
  return `${completed}/${planned} employés ont complété leur journée — ${remaining} journée${remaining>1?"s":""} reste${remaining>1?"nt":""} à renseigner.`;
}

async function sendOwnerSummaries(workDate:string,testMode:boolean){
  const [employeesRes,scheduleRes,entriesRes,segmentsRes,leavesRes,ownersRes,subscriptionsRes,logsRes] = await Promise.all([
    supabase.from("employees").select("id,name").eq("active",true),
    supabase.from("work_schedule").select("employee_id,is_working").eq("work_date",workDate),
    supabase.from("work_entries").select("employee_id,status,arrival,departure").eq("work_date",workDate),
    supabase.from("work_segments").select("employee_id").eq("work_date",workDate),
    supabase.from("leave_requests").select("employee_id,start_date,end_date,status").eq("status","validated").lte("start_date",workDate).gte("end_date",workDate),
    supabase.from("owner_accounts").select("id,label").eq("active",true),
    supabase.from("owner_push_subscriptions").select("owner_id,endpoint,p256dh,auth,launch_url").eq("active",true),
    supabase.from("owner_summary_log").select("owner_id").eq("work_date",workDate)
  ]);
  for(const r of [employeesRes,scheduleRes,entriesRes,segmentsRes,leavesRes,ownersRes,subscriptionsRes,logsRes]) if(r.error) throw new Error(r.error.message);

  const employees=employeesRes.data||[];
  const schedule=new Map((scheduleRes.data||[]).map((r:any)=>[r.employee_id,!!r.is_working]));
  const entries=new Map((entriesRes.data||[]).map((r:any)=>[r.employee_id,r]));
  const actualWorkers=new Set((segmentsRes.data||[]).map((r:any)=>r.employee_id));
  const onLeave=new Set((leavesRes.data||[]).map((r:any)=>r.employee_id));

  const planned=employees.filter((e:any)=>{
    if(onLeave.has(e.id)) return false;
    const entry:any=entries.get(e.id);
    if(entry?.status==="off") return false;
    const scheduled=schedule.has(e.id)?schedule.get(e.id):defaultWorkingDay(workDate);
    const actuallyWorked=actualWorkers.has(e.id)||entry?.status==="worked";
    return scheduled||actuallyWorked;
  });
  if(!planned.length) return {targeted:0,sent:0,failed:0,skipped:true,reason:"nobody_working"};

  const incompleteNames:string[]=[];
  let completed=0;
  for(const e of planned){
    const entry:any=entries.get(e.id);
    const done=!!entry&&!!entry.arrival&&!!entry.departure;
    if(done) completed++; else incompleteNames.push(e.name);
  }

  const alreadySent=new Set((logsRes.data||[]).map((r:any)=>r.owner_id));
  const subscriptionsByOwner=new Map<string,any[]>();
  for(const sub of subscriptionsRes.data||[]){
    if(!subscriptionsByOwner.has(sub.owner_id)) subscriptionsByOwner.set(sub.owner_id,[]);
    subscriptionsByOwner.get(sub.owner_id)!.push(sub);
  }

  let targeted=0,sent=0,failed=0;
  for(const owner of ownersRes.data||[]){
    if(!testMode&&alreadySent.has(owner.id)) continue;
    const subs=subscriptionsByOwner.get(owner.id)||[];
    if(!subs.length) continue;
    targeted++;
    const message=ownerSummaryBody(completed,planned.length,incompleteNames);
    let ownerHadSuccess=false;
    for(const sub of subs){
      try{
        await webpush.sendNotification(
          {endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},
          JSON.stringify({
            title:testMode?"Test — Synthèse des horaires":"Synthèse des horaires",
            body:message,
            tag:`hours-owner-summary-${testMode?'test-':''}${workDate}`,
            url:sub.launch_url||"./pilotage.html"
          }),
          {TTL:60*60*6,urgency:"normal"}
        );
        ownerHadSuccess=true;sent++;
        await supabase.from("owner_push_subscriptions").update({last_success_at:new Date().toISOString(),active:true,updated_at:new Date().toISOString()}).eq("endpoint",sub.endpoint);
      }catch(err:any){
        failed++;
        const status=Number(err?.statusCode||err?.status||0);
        if(status===404||status===410) await supabase.from("owner_push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("endpoint",sub.endpoint);
        console.error("Owner push failed",owner.label,status,err?.message||err);
      }
    }
    if(ownerHadSuccess&&!testMode){
      await supabase.from("owner_summary_log").upsert({owner_id:owner.id,work_date:workDate,sent_at:new Date().toISOString()},{onConflict:"owner_id,work_date",ignoreDuplicates:true});
    }
  }
  return {targeted,sent,failed,planned:planned.length,completed,incomplete_names:incompleteNames,test_mode:testMode};
}

Deno.serve(async (req)=>{
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  if(req.headers.get("x-cron-secret")!==CRON_SECRET) return new Response("Unauthorized",{status:401});

  let body:any={};try{body=await req.json()}catch{}
  const now=parisNow();
  const testMode=body?.test_mode===true||body?.force===true;
  if(!testMode&&now.hour!==19){
    return Response.json({ok:true,skipped:true,reason:"not_19h_paris",paris_time:now});
  }

  const {data:batch,error:batchError}=await supabase.rpc("system_get_reminder_batch",{p_work_date:now.date,p_ignore_log:testMode});
  if(batchError) return Response.json({ok:false,error:batchError.message},{status:500});

  let employeeSent=0,employeeSkipped=0,employeeFailed=0;
  for(const employee of (batch||[])){
    const subscriptions=Array.isArray(employee.subscriptions)?employee.subscriptions:[];
    if(!subscriptions.length){employeeSkipped++;continue}
    let sentForEmployee=false;
    for(const sub of subscriptions){
      try{
        await webpush.sendNotification(
          {endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},
          JSON.stringify({
            title:testMode?"Test — Mes horaires":"Mes horaires",
            body:"Ta journée d’aujourd’hui n’est pas encore complète. Pense à renseigner ton heure de fin ou à compléter tes horaires.",
            tag:`hours-${testMode?'test-':''}${now.date}`,
            url:sub.launch_url||"./employee.html"
          }),
          {TTL:60*60*3,urgency:"normal"}
        );
        sentForEmployee=true;employeeSent++;
        await supabase.rpc("system_mark_push_success",{p_endpoint:sub.endpoint});
      }catch(err:any){
        employeeFailed++;
        const status=Number(err?.statusCode||err?.status||0);
        if(status===404||status===410) await supabase.rpc("system_deactivate_push_subscription",{p_endpoint:sub.endpoint});
        console.error("Employee push failed",employee.name,status,err?.message||err);
      }
    }
    if(sentForEmployee&&!testMode){
      await supabase.rpc("system_record_reminder_success",{p_employee_id:employee.employee_id,p_work_date:now.date});
    }
  }

  let ownerResult;
  try{ownerResult=await sendOwnerSummaries(now.date,testMode)}catch(err:any){
    console.error("Owner summary failed",err?.message||err);
    return Response.json({ok:false,employees:{targeted:(batch||[]).length,sent:employeeSent,skipped:employeeSkipped,failed:employeeFailed},pilotage_error:err?.message||String(err)},{status:500});
  }

  return Response.json({ok:true,date:now.date,test_mode:testMode,employees:{targeted:(batch||[]).length,sent:employeeSent,skipped:employeeSkipped,failed:employeeFailed},pilotage:ownerResult});
});
