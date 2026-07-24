import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wallet Note",
  description: "Business management and accounting application",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Wallet Note" },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          // apply saved theme before paint to avoid flashing
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("wn-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch{}
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
