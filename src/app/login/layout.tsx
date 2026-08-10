import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ဝင်မည်",
  description: "Wallet Note အကောင့်ဖြင့် ဝင်ပါ — 2D 3D မှတ်တမ်း၊ ပိုက်ဆံအိတ်နှင့် ဆိုင်စာရင်း။",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
