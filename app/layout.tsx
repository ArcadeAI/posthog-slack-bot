import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PostHog Slack Bot",
  description: "PostHog analytics bot for Slack",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
