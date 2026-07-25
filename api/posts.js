import { z } from 'zod';
import { auth, body, cleanText, db, handler, json, method, rateLimit } from '../lib/core.js';
export default async function(req){ return handler(async()=>{
 const bad=method(req,['GET','POST','PATCH','DELETE']); if(bad)return bad; const client=db(); const user=await auth(req); await rateLimit(client,`posts:${user.id}`,60,60); const u=new URL(req.url);
 if(req.method==='GET'){ const limit=Math.min(Number(u.searchParams.get('limit')||20),50); const {data,error}=await client.from('posts').select('id,content,media_url,post_type,created_at,boosted_until,profiles!posts_user_id_fkey(id,username,display_name,avatar_url),reactions(count),comments(count)').eq('status','published').order('boosted_until',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).limit(limit); if(error)throw error; return json({posts:data}); }
 const input=await body(req);
 if(req.method==='POST'){ const v=z.object({content:z.string().min(1).max(2000),mediaUrl:z.string().url().max(1000).nullable().optional(),communityId:z.string().uuid().nullable().optional()}).parse(input); const {data,error}=await client.from('posts').insert({user_id:user.id,content:cleanText(v.content),media_url:v.mediaUrl||null,community_id:v.communityId||null}).select().single(); if(error)throw error; return json({post:data},201); }
 const id=z.string().uuid().parse(input.id);
 if(req.method==='PATCH'){ const content=cleanText(z.string().min(1).max(2000).parse(input.content)); const {data,error}=await client.from('posts').update({content,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id).select().maybeSingle(); if(error)throw error; if(!data)throw Object.assign(new Error('Not found'),{status:404}); return json({post:data}); }
 const {data,error}=await client.from('posts').update({status:'deleted',content:'[deleted]',media_url:null}).eq('id',id).eq('user_id',user.id).select('id').maybeSingle(); if(error)throw error; if(!data)throw Object.assign(new Error('Not found'),{status:404}); return json({ok:true});
},req); }
