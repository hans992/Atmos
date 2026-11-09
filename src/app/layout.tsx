import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";
import { ClimateProvider } from "@/components/climate-provider";
import { Shell } from "@/components/shell";
import { AppearanceProvider } from "@/components/appearance-provider";
import { WeatherProvider } from "@/components/weather-provider";
import "./atmosphere.css";
export const metadata: Metadata = {
  title: { default: "Atmos — Your home, in balance", template: "%s · Atmos" },
  description:
    "A little insight into every room. Monitor temperature, humidity, and sensor health with Atmos.",
  applicationName: "Atmos",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Atmos" },
  icons: { icon: "/icon.svg", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf1f7" },
    { media: "(prefers-color-scheme: dark)", color: "#182330" },
  ],
};
const themeScript =
  "try{var t=localStorage.getItem('atmos-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Suspense
          fallback={<div className="loading-state">Opening Atmos…</div>}
        >
          <AppearanceProvider>
            <WeatherProvider>
              <ClimateProvider>
                <Shell>{children}</Shell>
              </ClimateProvider>
            </WeatherProvider>
          </AppearanceProvider>
        </Suspense>
      </body>
    </html>
  );
}
