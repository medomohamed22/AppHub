import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = { title:"Island Way", description:"3D island adventure for Pi Browser" };
export const viewport: Viewport = { width:"device-width", initialScale:1, maximumScale:1, userScalable:false, viewportFit:"cover", themeColor:"#06141b" };

export default function RootLayout({ children }:{ children:React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body>{children}<Script src="https://sdk.minepi.com/pi-sdk.js" strategy="afterInteractive" /></body></html>;
}
