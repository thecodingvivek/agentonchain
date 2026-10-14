import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sign in · Agentonchain",
  description: "Sign in to your Agentonchain agent workspace. Local prototype with demo credentials.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="lime">{children}</body>
    </html>
  );
}
