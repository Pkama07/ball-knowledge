import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Footer } from "@/components/Footer";

// Central site metadata — shared across the document head, Open Graph (chat
// apps, Slack, Discord, etc.), and Twitter cards.
const site = {
	name: "ShotFor.Me",
	title: "ShotFor.Me",
	description: "Race your friends to see who can guess a song first.",
	url: "https://shotfor.me",
	ogImage: {
		url: "/og-image.png",
		width: 1200,
		height: 630,
		alt: "ShotFor.Me",
	},
};

export const metadata: Metadata = {
	metadataBase: new URL(site.url),
	title: site.title,
	description: site.description,
	openGraph: {
		title: site.title,
		description: site.description,
		url: site.url,
		siteName: site.name,
		images: [site.ogImage],
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: site.title,
		description: site.description,
		images: [site.ogImage.url],
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin="anonymous"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Bitcount+Grid+Double:wght@100;200;300;400&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>
				<AuthProvider>{children}</AuthProvider>
				<Footer />
				<Analytics />
			</body>
		</html>
	);
}
