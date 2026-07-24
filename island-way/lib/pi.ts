import "server-only";
import { serverEnv } from "./env";
const base="https://api.minepi.com/v2";
export type PiPaymentDTO={identifier:string;user_uid:string;amount:number;metadata:Record<string,unknown>;direction:string;network:string;status:{developer_approved:boolean;transaction_verified:boolean;developer_completed:boolean;cancelled:boolean;user_cancelled:boolean};transaction:null|{txid:string;verified:boolean}};
async function parse<T>(r:Response):Promise<T>{const data=await r.json();if(!r.ok) throw new Error(`Pi API ${r.status}`);return data as T;}
export async function piMe(token:string){return parse<{uid:string;username:string}>(await fetch(`${base}/me`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(8000)}));}
export async function approvePayment(id:string){return parse<PiPaymentDTO>(await fetch(`${base}/payments/${encodeURIComponent(id)}/approve`,{method:"POST",headers:{Authorization:`Key ${serverEnv().PI_SERVER_API_KEY}`},cache:"no-store",signal:AbortSignal.timeout(10000)}));}
export async function completePayment(id:string,txid:string){return parse<PiPaymentDTO>(await fetch(`${base}/payments/${encodeURIComponent(id)}/complete`,{method:"POST",headers:{Authorization:`Key ${serverEnv().PI_SERVER_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({txid}),cache:"no-store",signal:AbortSignal.timeout(10000)}));}
