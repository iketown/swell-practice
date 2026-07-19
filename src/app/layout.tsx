import type { Metadata } from "next";
import { Geist, Geist_Mono, Londrina_Shadow, Londrina_Solid } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const londrinaSolid = Londrina_Solid({
  variable: "--font-londrina-solid",
  subsets: ["latin"],
  weight: "400",
});

const londrinaShadow = Londrina_Shadow({
  variable: "--font-londrina-shadow",
  subsets: ["latin"],
  weight: "400",
});

const favicon = process.env.NODE_ENV === "development" ? "/favicon-local.png" : "/favicon-production.png";

export const metadata: Metadata = {
  title: "The Swell Parts",
  description: "Internal song parts library for The Swell",
  icons: {
    icon: [{ url: favicon, type: "image/png" }],
    shortcut: [{ url: favicon, type: "image/png" }],
    apple: [{ url: favicon, type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${londrinaSolid.variable} ${londrinaShadow.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
