import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { AppHeaderProvider } from "@/components/app-header-shell";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "IdleDiary",
  description: "A no-pressure three-second vlogging PWA.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "IdleDiary",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0a0c",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppHeaderProvider>
          {children}
          <PwaRegister />
          <Analytics />
        </AppHeaderProvider>
      </body>
    </html>
  );
}
