import type { Metadata } from "next";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { Noto_Sans_KR } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const siteTitle = `${ACTIVE_PROFILE.province.shortName} 교육지도`;
const siteDescription = "강원 학교와 시군별 교육 현황을 살펴보는 개인 제작 업무 참고용 도구입니다.";

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: siteTitle,
  description: siteDescription,
  ...(siteUrl ? { alternates: { canonical: "/" } } : {}),
  openGraph: {
    type: "website",
    locale: "ko_KR",
    ...(siteUrl ? { url: "/" } : {}),
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/social-preview.png", width: 1200, height: 630, alt: `${siteTitle} 공유 미리보기` }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/social-preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={notoSansKr.variable}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
