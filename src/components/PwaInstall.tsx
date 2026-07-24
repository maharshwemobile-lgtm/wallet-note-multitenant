"use client";

import { useEffect, useState } from "react";
import { Download, MoreVertical, PlusSquare, Share } from "lucide-react";
import { Button, Modal, cn } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstall({ compact = false }: { compact?: boolean }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setInstalled(isStandalone());
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    });

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstalled(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setShowHelp(true);
      return;
    }

    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={install}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950",
          compact ? "min-h-10 min-w-10 p-2" : "min-h-10 px-3 py-2 text-sm"
        )}
        title="Install Wallet Note"
        aria-label="Install Wallet Note"
      >
        <Download size={compact ? 18 : 17} />
        {!compact && <span>Install App</span>}
      </button>

      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Install Wallet Note">
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
          {isIos ? (
            <>
              <p className="flex items-center gap-3">
                <Share className="shrink-0 text-blue-600" size={21} />
                Tap the Share button in Safari.
              </p>
              <p className="flex items-center gap-3">
                <PlusSquare className="shrink-0 text-blue-600" size={21} />
                Choose Add to Home Screen, then tap Add.
              </p>
            </>
          ) : (
            <p className="flex items-center gap-3">
              <MoreVertical className="shrink-0 text-blue-600" size={21} />
              Open the browser menu and choose Install app or Add to Home screen.
            </p>
          )}
          <Button className="w-full" onClick={() => setShowHelp(false)}>Done</Button>
        </div>
      </Modal>
    </>
  );
}
