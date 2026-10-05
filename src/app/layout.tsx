import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "豆格 · 拼豆创作工作台 | BeadGrid",
  applicationName: "豆格 BeadGrid",
  description: "豆格 BeadGrid，把创意变成拼豆图纸。上传图片、匹配色板、精细编辑，导出图纸与采购清单。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "豆格",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body
        className="antialiased overflow-x-hidden bg-neutral-950 text-neutral-100"
      >

        {children}
        <footer className="px-4 py-6 text-center text-xs text-neutral-400">
          基于 Zippland / perler-beads · AGPL-3.0 · <a className="underline" href={process.env.NEXT_PUBLIC_SOURCE_URL || 'https://github.com/luoyuex/beadgrid'}>获取对应源码</a>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
