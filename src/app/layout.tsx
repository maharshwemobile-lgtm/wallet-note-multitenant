import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Where the site actually lives, used to make every canonical and social URL absolute.
 *  Search engines treat a relative canonical as no canonical at all. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://walletnote.online";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  /** No lottery wording anywhere a link preview can reach it.
   *
   *  Facebook blocks links whose page describes betting, and it reads the title and
   *  description to decide — so naming the module in them got the whole site blocked from
   *  being shared, which costs far more than the search traffic those words brought in.
   *  The module is still in the app; it is simply not the shop window.
   */
  title: {
    default: "Wallet Note — ဆိုင်စာရင်းနှင့် ပိုက်ဆံအိတ် စီမံခန့်ခွဲမှု",
    // Every other page reads "<its title> · Wallet Note", so a search result says which
    // page it is without each page repeating the brand itself.
    template: "%s · Wallet Note",
  },
  description:
    "ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်း၊ ဝင်ငွေထွက်ငွေ၊ အကြွေး၊ ငွေလဲနှုန်းနှင့် ဖုန်းပြင်ဆင်ခ — " +
    "မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။ ဖုန်းပေါ်မှာပဲ သုံးလို့ရပြီး Telegram နဲ့လည်း ချိတ်လို့ရပါတယ်။",
  keywords: [
    "ပိုက်ဆံအိတ်", "ငွေစာရင်း", "ဆိုင်စာရင်း", "အကြွေးစာရင်း", "ဝင်ငွေ ထွက်ငွေ",
    "Wallet Note", "မြန်မာ POS", "ငွေလဲနှုန်း", "ဖုန်းဆိုင် စာရင်း",
    "ကုန်ပစ္စည်းစာရင်း", "Myanmar accounting app", "small business app Myanmar",
  ],
  manifest: "/manifest.webmanifest",
  applicationName: "Wallet Note",
  appleWebApp: { capable: true, title: "Wallet Note", statusBarStyle: "default" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Wallet Note",
    locale: "my_MM",
    url: SITE_URL,
    title: "Wallet Note — ဆိုင်စာရင်းနှင့် ပိုက်ဆံအိတ်",
    description:
      "ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်းနှင့် အကြွေးစာရင်း — မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Wallet Note" }],
  },
  twitter: {
    card: "summary",
    title: "Wallet Note — ဆိုင်စာရင်းနှင့် ပိုက်ဆံအိတ်",
    description: "မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။",
    images: ["/icon-512.png"],
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
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
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
/* The browser fires beforeinstallprompt once, usually before React has hydrated. A
   listener added by a component therefore misses it and the Install button never
   appears. Catch it here and hand it over once the component is listening. */
addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__wnInstallPrompt=e;dispatchEvent(new Event("wn-install-ready"))});
addEventListener("appinstalled",function(){window.__wnInstallPrompt=null});`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
