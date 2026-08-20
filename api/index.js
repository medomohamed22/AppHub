import { createClient } from "@supabase/supabase-js";

const PI_API = "https://api.minepi.com/v2";
const jsonHeaders = {"Content-Type":"application/json"};

const FALLBACK_PRICES = Object.freeze({
  featured_1d: Number(process.env.PRICE_FEATURED_1D || 1),
  featured_7d: Number(process.env.PRICE_FEATURED_7D || 5),
  pro_month: Number(process.env.PRICE_PRO_MONTH || 2),
});

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, {
    auth:{persistSession:false, autoRefreshToken:false}
  });
}
function ok(res, data, status=200) {
  res.status(status).setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  return res.end(JSON.stringify(data));
}
function fail(res, status, message, code="BAD_REQUEST") {
  return ok(res, {error:message, code}, status);
}
function bearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
async function piFetch(path, {method="GET", serverKey=false, accessToken="", body}={}) {
  const headers = {...jsonHeaders};
  if (serverKey) {
    if (!process.env.PI_API_KEY) throw new Error("PI_API_KEY is missing.");
    headers.Authorization = `Key ${process.env.PI_API_KEY}`;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const r = await fetch(`${PI_API}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) {
    const err = new Error(data?.error_message || data?.message || data?.error || `Pi API ${r.status}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}
async function requirePiUser(req) {
  const token = bearer(req);
  if (!token) {
    const e = new Error("Pi authentication required.");
    e.status = 401;
    throw e;
  }
  const me = await piFetch("/me", {accessToken:token});
  if (!me?.uid) {
    const e = new Error("Pi token verification failed.");
    e.status = 401;
    throw e;
  }
  return {token, me};
}
async function upsertUser(db, me) {
  const {data, error} = await db.from("users").upsert({
    pi_uid: me.uid,
    username: me.username || null,
    wallet_address: me.wallet_address || null,
    last_seen_at: new Date().toISOString()
  }, {onConflict:"pi_uid"}).select().single();
  if (error) throw error;
  return data;
}

async function getPrices(db) {
  const {data,error}=await db.from("settings").select("value").eq("key","pricing").maybeSingle();
  if(error) throw error;
  const p=data?.value || {};
  return {
    featured_1d:Number(p.featured_1d ?? FALLBACK_PRICES.featured_1d),
    featured_7d:Number(p.featured_7d ?? FALLBACK_PRICES.featured_7d),
    pro_month:Number(p.pro_month ?? FALLBACK_PRICES.pro_month)
  };
}
function validatePrices(p){
  const out={};
  for(const k of ["featured_1d","featured_7d","pro_month"]){
    const v=Number(p?.[k]);
    if(!Number.isFinite(v)||v<=0||v>100000) throw new Error(`Invalid price for ${k}.`);
    out[k]=v;
  }
  return out;
}
async function requireActiveUser(db, req) {
  const {token,me}=await requirePiUser(req);
  const user=await upsertUser(db,me);
  if(user.banned_at){
    const e=new Error("This account is banned.");
    e.status=403; throw e;
  }
  return {token,me,user};
}
async function requireAdmin(db, req) {
  const {token,me,user}=await requireActiveUser(db,req);
  if(user.role!=="admin"){
    const e=new Error("Admin access required.");
    e.status=403; throw e;
  }
  return {token,me,user};
}

function validUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||"");}
function safeUrl(v) {
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    return u.href;
  } catch { return null; }
}
function asBool(v){return v===true || v==="true" || v===1;}
function sameAmount(a,b){return Math.abs(Number(a)-Number(b)) < 1e-8;}

async function listApps(db, req) {
  const category = String(req.query.category || "").trim();
  let q = db.from("apps_public").select("*").order("sponsored",{ascending:false}).order("votes_count",{ascending:false}).limit(100);
  if (category) q = q.eq("category", category);
  const {data,error}=await q;
  if(error) throw error;
  return data || [];
}
async function userState(db, userId) {
  const [{data:saves,error:se},{data:votes,error:ve}] = await Promise.all([
    db.from("saves").select("apps(name)").eq("user_id",userId),
    db.from("votes").select("apps(name)").eq("user_id",userId),
  ]);
  if(se) throw se;if(ve) throw ve;
  return {
    savedAppNames:(saves||[]).map(x=>x.apps?.name).filter(Boolean),
    votedAppNames:(votes||[]).map(x=>x.apps?.name).filter(Boolean),
  };
}
async function toggleRelation(db, table, userId, appId) {
  if(!validUuid(appId)) throw new Error("Invalid app id.");
  const {data:existing,error:ee}=await db.from(table).select("id").eq("user_id",userId).eq("app_id",appId).maybeSingle();
  if(ee) throw ee;
  if(existing){
    const {error}=await db.from(table).delete().eq("id",existing.id);
    if(error) throw error;
    return false;
  }
  const {error}=await db.from(table).insert({user_id:userId,app_id:appId});
  if(error) throw error;
  return true;
}
async function countVotes(db, appId){
  const {count,error}=await db.from("votes").select("*",{count:"exact",head:true}).eq("app_id",appId);
  if(error) throw error;
  return count || 0;
}

async function validatePaymentForApproval(db, me, body, prices) {
  const {paymentId, product, appId} = body || {};
  if (!paymentId || !prices[product]) throw new Error("Invalid payment request.");
  const payment = await piFetch(`/payments/${encodeURIComponent(paymentId)}`, {serverKey:true});
  if (payment.user_uid !== me.uid) throw new Error("Payment user mismatch.");
  if (payment.direction && payment.direction !== "user_to_app") throw new Error("Unexpected payment direction.");
  if (!sameAmount(payment.amount, prices[product])) throw new Error("Payment amount mismatch.");
  if (payment.metadata?.product !== product) throw new Error("Payment product mismatch.");
  if (appId && payment.metadata?.appId && payment.metadata.appId !== appId) throw new Error("Payment app mismatch.");

  if (product === "featured_1d" || product === "featured_7d") {
    if (!validUuid(appId)) throw new Error("A valid app is required for featured placement.");
    const {data:owner,error:ownerError}=await db.from("users").select("id").eq("pi_uid",me.uid).maybeSingle();
    if(ownerError) throw ownerError;
    if(!owner) throw new Error("User account not found.");
    const {data:targetApp,error:appError}=await db.from("apps")
      .select("id,owner_id,status").eq("id",appId).maybeSingle();
    if(appError) throw appError;
    if(!targetApp || targetApp.owner_id!==owner.id) throw new Error("You can only feature your own app.");
    if(targetApp.status!=="approved") throw new Error("Only approved apps can be featured.");
  }

  const {error} = await db.from("payments").upsert({
    pi_payment_id:paymentId,
    user_pi_uid:me.uid,
    app_id:validUuid(appId)?appId:null,
    product,
    amount:Number(payment.amount),
    status:"pending",
    raw_payment:payment,
    updated_at:new Date().toISOString()
  },{onConflict:"pi_payment_id"});
  if(error) throw error;
  return payment;
}
async function fulfillPurchase(db, row) {
  const now = new Date();
  if (row.product === "pro_month") {
    const until = new Date(now.getTime()+30*24*60*60*1000).toISOString();
    await db.from("users").update({pro_until:until}).eq("pi_uid",row.user_pi_uid);
  } else if ((row.product === "featured_1d" || row.product === "featured_7d") && row.app_id) {
    const days = row.product === "featured_7d" ? 7 : 1;
    const until = new Date(now.getTime()+days*24*60*60*1000).toISOString();
    await db.from("apps").update({featured_until:until}).eq("id",row.app_id);
  }
}

export default async function handler(req, res) {
  // Basic hardening for a JSON API.
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","same-origin");
  const action = String(req.query.action || "health");
  try {
    if (req.method === "OPTIONS") return ok(res,{ok:true});

    if (action === "health" && req.method === "GET")
      return ok(res,{ok:true,time:new Date().toISOString(),service:"apphub-api"});

    const db = supabaseAdmin();

    if (action === "config" && req.method === "GET")
      return ok(res,{
        piSandbox:String(process.env.PI_SANDBOX || "false").toLowerCase()==="true",
        prices:await getPrices(db)
      });

    if (action === "apps" && req.method === "GET")
      return ok(res,{apps:await listApps(db,req)});


    if (action === "reviews" && req.method === "GET") {
      const appId=String(req.query.appId||"");
      if(!validUuid(appId)) return fail(res,400,"Invalid app id.");
      const {data,error}=await db.from("reviews")
        .select("id,app_id,rating,body,created_at,users!reviews_user_id_fkey(username)")
        .eq("status","published")
        .eq("app_id",appId)
        .order("created_at",{ascending:false})
        .limit(100);
      if(error) throw error;
      return ok(res,{reviews:(data||[]).map(r=>({
        id:r.id,app_id:r.app_id,rating:r.rating,body:r.body,created_at:r.created_at,
        username:r.users?.username || "Pioneer"
      }))});
    }

    if (action === "event" && req.method === "POST") {
      const b=req.body||{};
      const appId=String(b.appId||""), type=String(b.type||"");
      if(!validUuid(appId)||!["view","open"].includes(type)) return fail(res,400,"Invalid event.");
      const {data:app,error:ae}=await db.from("apps").select("id,status").eq("id",appId).maybeSingle();
      if(ae) throw ae;
      if(!app || app.status!=="approved") return fail(res,404,"App not found.");
      const {error}=await db.from("app_events").insert({
        app_id:appId,event_type:type,
        user_agent:String(req.headers["user-agent"]||"").slice(0,500)
      });
      if(error) throw error;
      return ok(res,{recorded:true},201);
    }

    if (action === "developer-summary" && req.method === "GET") {
      const {user}=await requireActiveUser(db,req);
      const {data:owned,error:oe}=await db.from("apps")
        .select("id,name,status,network,created_at")
        .eq("owner_id",user.id)
        .order("created_at",{ascending:false});
      if(oe) throw oe;
      const results=[];
      const start=new Date(); start.setUTCHours(0,0,0,0); start.setUTCDate(start.getUTCDate()-6);
      for(const app of (owned||[])){
        const [
          {count:votes,error:ve},
          {data:reviews,error:re},
          {data:events,error:ee}
        ]=await Promise.all([
          db.from("votes").select("*",{count:"exact",head:true}).eq("app_id",app.id),
          db.from("reviews").select("rating").eq("app_id",app.id).eq("status","published"),
          db.from("app_events").select("event_type,created_at").eq("app_id",app.id).gte("created_at",start.toISOString())
        ]);
        if(ve||re||ee) throw (ve||re||ee);
        const ratings=(reviews||[]).map(x=>Number(x.rating)).filter(Number.isFinite);
        const dailyViews=Array(7).fill(0);
        let views=0,opens=0;
        for(const ev of (events||[])){
          if(ev.event_type==="view") views++;
          if(ev.event_type==="open") opens++;
          if(ev.event_type==="view"){
            const d=Math.floor((new Date(ev.created_at)-start)/(24*60*60*1000));
            if(d>=0&&d<7) dailyViews[d]++;
          }
        }
        const [allViewsRes,allOpensRes]=await Promise.all([
          db.from("app_events").select("*",{count:"exact",head:true}).eq("app_id",app.id).eq("event_type","view"),
          db.from("app_events").select("*",{count:"exact",head:true}).eq("app_id",app.id).eq("event_type","open")
        ]);
        if(allViewsRes.error||allOpensRes.error) throw (allViewsRes.error||allOpensRes.error);
        const allViews=allViewsRes.count||0, allOpens=allOpensRes.count||0;
        results.push({
          ...app,
          votes:votes||0,
          reviews:ratings.length,
          rating:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:0,
          views:allViews,
          opens:allOpens,
          dailyViews
        });
      }
      return ok(res,{apps:results});
    }

    if (action === "auth" && req.method === "POST") {
      const {me,user}=await requireActiveUser(db,req);
      return ok(res,{user:{id:user.id,uid:me.uid,username:me.username || null,role:user.role,scopes:me.credentials?.scopes || []}});
    }

    if (action === "my" && req.method === "GET") {
      const {me,user}=await requireActiveUser(db,req);
      return ok(res,{user:{username:user.username,proUntil:user.pro_until,role:user.role},...(await userState(db,user.id))});
    }

    if (action === "vote" && req.method === "POST") {
      const {me,user}=await requireActiveUser(db,req);
      const appId=req.body?.appId;
      const voted=await toggleRelation(db,"votes",user.id,appId);
      return ok(res,{voted,votesCount:await countVotes(db,appId)});
    }

    if (action === "save" && req.method === "POST") {
      const {me,user}=await requireActiveUser(db,req);
      const saved=await toggleRelation(db,"saves",user.id,req.body?.appId);
      return ok(res,{saved});
    }

    if (action === "review" && req.method === "POST") {
      const {me,user}=await requireActiveUser(db,req);
      const appId=req.body?.appId, rating=Number(req.body?.rating), body=String(req.body?.body||"").trim();
      if(!validUuid(appId) || !Number.isInteger(rating) || rating<1 || rating>5 || body.length<3 || body.length>1200)
        return fail(res,400,"Invalid review.");
      const {data,error}=await db.from("reviews").upsert({
        user_id:user.id,app_id:appId,rating,body,status:"published",updated_at:new Date().toISOString()
      },{onConflict:"user_id,app_id"}).select().single();
      if(error) throw error;
      return ok(res,{review:data},201);
    }


    if (action === "upload-sign" && req.method === "POST") {
      const {user}=await requireActiveUser(db,req);
      const b=req.body||{};
      const kind=String(b.kind||"");
      const contentType=String(b.contentType||"");
      const size=Number(b.size||0);
      const allowedTypes=["image/png","image/jpeg","image/webp"];
      if(!["logo","screenshot"].includes(kind) || !allowedTypes.includes(contentType))
        return fail(res,400,"Invalid upload type.");
      const max=kind==="logo"?3*1024*1024:5*1024*1024;
      if(!Number.isFinite(size)||size<=0||size>max) return fail(res,400,"Invalid file size.");
      const ext=contentType==="image/png"?"png":contentType==="image/webp"?"webp":"jpg";
      const path=`${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const bucket="app-media";
      const {data,error}=await db.storage.from(bucket).createSignedUploadUrl(path);
      if(error) throw error;
      const {data:pub}=db.storage.from(bucket).getPublicUrl(path);
      return ok(res,{path,token:data.token,signedUrl:data.signedUrl,publicUrl:pub.publicUrl});
    }

    if (action === "submit-app" && req.method === "POST") {
      const {me,user}=await requireActiveUser(db,req);
      const b=req.body||{};
      const url=safeUrl(b.appUrl);
      const allowed=["AI","Tools","Shopping","Games","Business","Education"];
      if(String(b.name||"").trim().length<2 || !url || !allowed.includes(b.category))
        return fail(res,400,"Invalid app submission.");
      if(!b.logoUrl || !b.logoPath || !Array.isArray(b.screenshots) || b.screenshots.length<1 || b.screenshots.length>3)
        return fail(res,400,"Logo and 1-3 screenshots are required.");
      const {data,error}=await db.from("apps").insert({
        owner_id:user.id,
        name:String(b.name).trim().slice(0,80),
        slug:`${String(b.name).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55)}-${Date.now().toString(36)}`,
        description_en:String(b.descriptionEn||"").trim().slice(0,3000),
        description_ar:String(b.descriptionAr||"").trim().slice(0,3000),
        category:b.category,
        app_url:url,
        network:b.network==="Testnet"?"Testnet":"Mainnet",
        supports_pi_payments:asBool(b.supportsPayments),
        logo_url:String(b.logoUrl||"").slice(0,1000),
        logo_path:String(b.logoPath||"").slice(0,500),
        screenshots:Array.isArray(b.screenshots)?b.screenshots.slice(0,3):[],
        status:"pending"
      }).select().single();
      if(error) throw error;
      if(user.role==="user"){
        const {error:roleError}=await db.from("users").update({role:"developer"}).eq("id",user.id);
        if(roleError) throw roleError;
      }
      return ok(res,{app:data},201);
    }

    if (action === "payment-approve" && req.method === "POST") {
      const {me}=await requireActiveUser(db,req);
      const prices=await getPrices(db);
      await validatePaymentForApproval(db,me,req.body,prices);
      const paymentId=req.body.paymentId;
      const approved=await piFetch(`/payments/${encodeURIComponent(paymentId)}/approve`,{method:"POST",serverKey:true,body:{}});
      await db.from("payments").update({status:"approved",raw_payment:approved,updated_at:new Date().toISOString()}).eq("pi_payment_id",paymentId);
      return ok(res,{approved:true,payment:approved});
    }

    if (action === "payment-complete" && req.method === "POST") {
      const {me}=await requireActiveUser(db,req);
      const paymentId=String(req.body?.paymentId||""), txid=String(req.body?.txid||"");
      if(!paymentId || !txid) return fail(res,400,"paymentId and txid are required.");
      const {data:row,error:re}=await db.from("payments").select("*").eq("pi_payment_id",paymentId).maybeSingle();
      if(re) throw re;
      if(!row || row.user_pi_uid!==me.uid) return fail(res,403,"Payment not owned by this user.");
      if(row.status==="completed") return ok(res,{completed:true,idempotent:true});
      const completed=await piFetch(`/payments/${encodeURIComponent(paymentId)}/complete`,{
        method:"POST",serverKey:true,body:{txid}
      });
      // Only fulfill after Pi acknowledges completion.
      const devCompleted = completed?.status?.developer_completed === true;
      const txMatches = !completed?.transaction?.txid || completed.transaction.txid === txid;
      if(!devCompleted || !txMatches)
        return fail(res,409,"Pi payment is not verified as completed.","PAYMENT_NOT_COMPLETE");
      await db.from("payments").update({
        status:"completed",txid,raw_payment:completed,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }).eq("pi_payment_id",paymentId);
      await fulfillPurchase(db,{...row,txid});
      return ok(res,{completed:true,payment:completed});
    }

    if (action === "payment-cancel" && req.method === "POST") {
      const {me}=await requireActiveUser(db,req);
      const paymentId=String(req.body?.paymentId||"");
      if(!paymentId) return fail(res,400,"paymentId required.");
      const {data:row,error}=await db.from("payments").select("user_pi_uid").eq("pi_payment_id",paymentId).maybeSingle();
      if(error) throw error;
      if(row && row.user_pi_uid!==me.uid) return fail(res,403,"Payment not owned by this user.");
      let cancelled=null;
      try {
        cancelled=await piFetch(`/payments/${encodeURIComponent(paymentId)}/cancel`,{method:"POST",serverKey:true,body:{}});
      } catch(e) {
        // Pi may already have cancelled it client-side; keep local state consistent.
        cancelled={warning:e.message};
      }
      await db.from("payments").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("pi_payment_id",paymentId);
      return ok(res,{cancelled:true,payment:cancelled});
    }


    if (action === "admin-me" && req.method === "GET") {
      const {user}=await requireActiveUser(db,req);
      return ok(res,{admin:user.role==="admin",user:{id:user.id,username:user.username,role:user.role}});
    }

    if (action === "admin-summary" && req.method === "GET") {
      await requireAdmin(db,req);
      const [
        {count:users,error:ue},
        {count:approvedApps,error:ae},
        {count:pendingApps,error:pe},
        {count:completedPayments,error:payE}
      ]=await Promise.all([
        db.from("users").select("*",{count:"exact",head:true}),
        db.from("apps").select("*",{count:"exact",head:true}).eq("status","approved"),
        db.from("apps").select("*",{count:"exact",head:true}).eq("status","pending"),
        db.from("payments").select("*",{count:"exact",head:true}).eq("status","completed")
      ]);
      if(ue||ae||pe||payE) throw (ue||ae||pe||payE);
      return ok(res,{users:users||0,approvedApps:approvedApps||0,pendingApps:pendingApps||0,completedPayments:completedPayments||0});
    }

    if (action === "admin-apps" && req.method === "GET") {
      await requireAdmin(db,req);
      const {data,error}=await db.from("apps")
        .select("id,name,category,network,status,verified,created_at,owner_id,logo_url,screenshots,users!apps_owner_id_fkey(username)")
        .order("created_at",{ascending:false}).limit(500);
      if(error) throw error;
      return ok(res,{apps:(data||[]).map(a=>({...a,owner_username:a.users?.username||null,users:undefined}))});
    }

    if (action === "admin-users" && req.method === "GET") {
      await requireAdmin(db,req);
      const {data,error}=await db.from("users")
        .select("id,pi_uid,username,role,banned_at,ban_reason,pro_until,created_at,apps(count)")
        .order("created_at",{ascending:false}).limit(500);
      if(error) throw error;
      return ok(res,{users:(data||[]).map(u=>({...u,apps_count:u.apps?.[0]?.count||0,apps:undefined}))});
    }

    if (action === "admin-app-action" && req.method === "POST") {
      const {user:admin}=await requireAdmin(db,req);
      const appId=String(req.body?.appId||""), op=String(req.body?.action||"");
      if(!validUuid(appId)) return fail(res,400,"Invalid app id.");
      if(op==="delete"){
        const {data:target,error:targetError}=await db.from("apps")
          .select("logo_path,screenshots").eq("id",appId).maybeSingle();
        if(targetError) throw targetError;
        if(target){
          const paths=[
            target.logo_path,
            ...(Array.isArray(target.screenshots)?target.screenshots.map(x=>x?.path):[])
          ].filter(Boolean);
          if(paths.length){
            const {error:storageError}=await db.storage.from("app-media").remove(paths);
            if(storageError) console.error("Storage cleanup failed",storageError);
          }
        }
        const {error}=await db.from("apps").delete().eq("id",appId);
        if(error) throw error;
        await db.from("admin_audit").insert({admin_user_id:admin.id,action:"delete_app",target_type:"app",target_id:appId});
        return ok(res,{deleted:true});
      }
      const changes={};
      if(op==="approve") changes.status="approved";
      else if(op==="reject") changes.status="rejected";
      else if(op==="hide") changes.status="hidden";
      else if(op==="verify") changes.verified=true;
      else if(op==="unverify") changes.verified=false;
      else return fail(res,400,"Unsupported app action.");
      changes.updated_at=new Date().toISOString();
      const {data,error}=await db.from("apps").update(changes).eq("id",appId).select().single();
      if(error) throw error;
      await db.from("admin_audit").insert({admin_user_id:admin.id,action:`app_${op}`,target_type:"app",target_id:appId});
      return ok(res,{app:data});
    }

    if (action === "admin-user-role" && req.method === "POST") {
      const {user:admin}=await requireAdmin(db,req);
      const userId=String(req.body?.userId||""), role=String(req.body?.role||"");
      if(!validUuid(userId)||!["user","developer","admin"].includes(role)) return fail(res,400,"Invalid role request.");
      if(userId===admin.id && role!=="admin") return fail(res,400,"You cannot remove your own admin role.");
      const {data,error}=await db.from("users").update({role}).eq("id",userId).select("id,username,role").single();
      if(error) throw error;
      await db.from("admin_audit").insert({admin_user_id:admin.id,action:"set_role",target_type:"user",target_id:userId,details:{role}});
      return ok(res,{user:data});
    }

    if (action === "admin-user-ban" && req.method === "POST") {
      const {user:admin}=await requireAdmin(db,req);
      const userId=String(req.body?.userId||""), banned=!!req.body?.banned, reason=String(req.body?.reason||"").slice(0,500);
      if(!validUuid(userId)) return fail(res,400,"Invalid user id.");
      if(userId===admin.id && banned) return fail(res,400,"You cannot ban your own admin account.");
      const changes=banned?{banned_at:new Date().toISOString(),ban_reason:reason}:{banned_at:null,ban_reason:null};
      const {data,error}=await db.from("users").update(changes).eq("id",userId).select("id,username,banned_at").single();
      if(error) throw error;
      await db.from("admin_audit").insert({admin_user_id:admin.id,action:banned?"ban_user":"unban_user",target_type:"user",target_id:userId,details:{reason}});
      return ok(res,{user:data});
    }

    if (action === "admin-pricing" && req.method === "GET") {
      await requireAdmin(db,req);
      return ok(res,{prices:await getPrices(db)});
    }

    if (action === "admin-pricing" && req.method === "POST") {
      const {user:admin}=await requireAdmin(db,req);
      const prices=validatePrices(req.body?.prices);
      const {error}=await db.from("settings").upsert({key:"pricing",value:prices,updated_by:admin.id,updated_at:new Date().toISOString()},{onConflict:"key"});
      if(error) throw error;
      await db.from("admin_audit").insert({admin_user_id:admin.id,action:"update_pricing",target_type:"settings",details:prices});
      return ok(res,{prices});
    }

    return fail(res,404,"Unknown API action.","NOT_FOUND");
  } catch (e) {
    console.error(action, e);
    const status = Number(e.status) || 500;
    // Avoid leaking database/API internals in production responses.
    return fail(res,status,status>=500?"Internal server error.":e.message,status>=500?"INTERNAL_ERROR":"REQUEST_FAILED");
  }
}
