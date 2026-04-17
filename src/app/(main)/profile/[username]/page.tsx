import { ProfileContent } from "@/components/profile/profile-content";
import type { Metadata } from "next";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;

  try {
    // Fetch profile metadata from Convex HTTP endpoint
    const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".cloud", ".site");
    if (!convexSiteUrl) {
      return { title: `@${username} - Hive` };
    }

    const res = await fetch(
      `${convexSiteUrl}/api/profile-meta?username=${encodeURIComponent(username)}`,
      {
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!res.ok) {
      return { title: `@${username} - Hive` };
    }

    const data = await res.json();

    if (!data.found) {
      return { title: "User Not Found - Hive" };
    }

    // Build metadata
    const displayName = data.displayName || `@${data.username}`;
    const title = `${displayName} - Hive`;
    const description = data.bio || `View ${displayName}'s profile on Hive`;

    // Base metadata
    const metadata: Metadata = {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "profile",
        username: data.username,
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };

    // Add noindex if user has disabled search engine indexing
    if (!data.allowSearchEngineIndexing) {
      metadata.robots = {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      };
    }

    return metadata;
  } catch (error) {
    console.error("Failed to fetch profile metadata:", error);
    return { title: `@${username} - Hive` };
  }
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;

  // Note: ProfileContent handles the layout internally
  // Header is full-width, tabs/posts are centered in feed-container
  return <ProfileContent username={username} />;
}
