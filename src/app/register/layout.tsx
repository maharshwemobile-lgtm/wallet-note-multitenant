import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "အခမဲ့ အကောင့်ဖွင့်ရန်",
  description:
    "Wallet Note မှာ အခမဲ့ အကောင့်ဖွင့်ပါ — 2D 3D မှတ်တမ်း၊ ပိုက်ဆံအိတ်၊ ရောင်းအားနှင့် အကြွေးစာရင်းကို ဖုန်းပေါ်မှာပဲ မှတ်ပါ။",
  alternates: { canonical: "/register" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
