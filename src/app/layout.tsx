import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Writing Feedback",
  description: "Chinese Writing AI Feedback Platform",
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
