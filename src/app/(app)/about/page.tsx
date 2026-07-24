"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { api } from "@/lib/client";
import { Card, Spinner } from "@/components/ui";

interface About {
  appName?: string; version?: string; description?: string; developer?: string;
  phone?: string; telegram?: string; website?: string; copyright?: string;
}

export default function AboutPage() {
  const [about, setAbout] = useState<About | null>(null);

  useEffect(() => {
    api<{ settings: { about?: About } }>("/api/v1/settings?key=about")
      .then((d) => setAbout(d.settings.about ?? {}))
      .catch(() => setAbout({}));
  }, []);

  if (!about) return <Spinner />;

  return (
    <div className="mx-auto max-w-md space-y-4 pt-8">
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="rounded-2xl bg-blue-600 p-4 text-white"><Wallet size={36} /></div>
        <h1 className="text-2xl font-bold">{about.appName ?? "Wallet Note"}</h1>
        <p className="text-sm text-gray-500">Version {about.version ?? "1.0.0"}</p>
        {about.description && <p className="max-w-xs text-sm text-gray-600 dark:text-gray-300">{about.description}</p>}
      </Card>
      <Card>
        <dl className="space-y-2 text-sm">
          {about.developer && (<div className="flex justify-between"><dt className="text-gray-500">Developer</dt><dd className="font-medium">{about.developer}</dd></div>)}
          {about.phone && (<div className="flex justify-between"><dt className="text-gray-500">Phone</dt><dd className="font-medium">{about.phone}</dd></div>)}
          {about.telegram && (<div className="flex justify-between"><dt className="text-gray-500">Telegram</dt><dd className="font-medium">{about.telegram}</dd></div>)}
          {about.website && (<div className="flex justify-between"><dt className="text-gray-500">Website</dt><dd className="font-medium">{about.website}</dd></div>)}
        </dl>
      </Card>
      <p className="text-center text-xs text-gray-400">{about.copyright ?? `© ${new Date().getFullYear()} Wallet Note`}</p>
    </div>
  );
}
