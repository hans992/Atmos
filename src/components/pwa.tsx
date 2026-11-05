"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const capture = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    if (!prompt) {
      setHint(!hint);
      return;
    }
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }
  return (
    <div className="install-wrap">
      <button className="install-button" onClick={install} disabled={installed}>
        <Download size={16} />
        {installed ? "App installed" : "Install Atmos"}
      </button>
      {hint && (
        <p className="install-hint" role="status">
          Open this site in Chrome on Android, then choose “Add to Home screen”
          in the browser menu.
        </p>
      )}
    </div>
  );
}
