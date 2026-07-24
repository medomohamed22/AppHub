export {};
declare global {
 interface Window { Pi?: { init(o:{version:string;sandbox?:boolean}):void; authenticate(scopes:string[], cb:(p:PiPayment)=>void|Promise<void>):Promise<{accessToken:string;user:{uid:string;username:string}}> ; createPayment(data:{amount:number;memo:string;metadata:Record<string,unknown>}, callbacks:{onReadyForServerApproval:(id:string)=>void|Promise<void>;onReadyForServerCompletion:(id:string,txid:string)=>void|Promise<void>;onCancel:(id:string)=>void;onError:(e:Error,p?:PiPayment)=>void}):void; }; }
 interface PiPayment { identifier:string; user_uid:string; amount:number; metadata:Record<string,unknown>; status:{developer_approved:boolean;transaction_verified:boolean;developer_completed:boolean;cancelled:boolean;user_cancelled:boolean}; transaction:null|{txid:string;verified:boolean}; }
}
