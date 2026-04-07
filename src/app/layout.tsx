import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "aiXIE Writing Lab",
  description: "AI-powered Chinese writing feedback with teacher review — by aiXIE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
