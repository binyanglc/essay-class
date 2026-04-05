import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "写作反馈平台",
  description: "中文写作课AI反馈系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
