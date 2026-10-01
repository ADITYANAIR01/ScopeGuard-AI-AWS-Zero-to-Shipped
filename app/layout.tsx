import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScopeGuard AI",
  description: "Paste your agreement + the new ask. We tell you if it's extra work, and help you reply.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sg-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
