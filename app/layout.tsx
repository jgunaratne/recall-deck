import type { Metadata, Viewport } from "next";
import { Baskervville, Geist_Mono, Libre_Baskerville } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const baskervville = Baskervville({
  variable: "--font-baskervville",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-libre-baskerville",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Recall Tutor — Pop Quizzes for Active Recall",
  description:
    "Chat with an AI tutor, then take quick pop quizzes from The Professor to consolidate your learning.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f2f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${baskervville.variable} ${geistMono.variable} ${libreBaskerville.variable} h-full`}
    >
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
