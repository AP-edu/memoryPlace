import type { MetadataRoute } from "next";

// Only the landing page is public; everything else sits behind sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/home", "/palaces", "/rooms", "/walk", "/study", "/decks", "/quiz", "/results", "/profile", "/admin"],
    },
  };
}
