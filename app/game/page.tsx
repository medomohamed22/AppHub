"use client";

import dynamic from "next/dynamic";
const GameClient=dynamic(()=>import("@/components/GameClient"),{ssr:false,loading:()=> <div style={{minHeight:"100vh",display:"grid",placeItems:"center",color:"white"}}>جاري تحميل الجزيرة…</div>});
export default function GamePage(){return <GameClient/>}
