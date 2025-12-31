import { getAuth } from "@clerk/react-router/ssr.server";
import { createClerkClient } from "@clerk/react-router/api.server";
import { ConvexHttpClient } from "convex/browser";
import ContentSection from "~/components/homepage/content";
import Footer from "~/components/homepage/footer";
import Integrations from "~/components/homepage/integrations";
import Pricing from "~/components/homepage/pricing";
import Team from "~/components/homepage/team";
import { api } from "../../convex/_generated/api";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  const title = "React Starter Kit - Launch Your SAAS Quickly";
  const description =
    "This powerful starter kit is designed to help you launch your SAAS application quickly and efficiently.";
  const keywords = "React, Starter Kit, SAAS, Launch, Quickly, Efficiently";
  const siteUrl = "https://www.reactstarter.xyz/";
  const imageUrl =
    "https://jdj14ctwppwprnqu.public.blob.vercel-storage.com/rsk-image-FcUcfBMBgsjNLo99j3NhKV64GT2bQl.png";

  return [
    { title },
    {
      name: "description",
      content: description,
    },

    // Open Graph / Facebook
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: imageUrl },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:url", content: siteUrl },
    { property: "og:site_name", content: "React Starter Kit" },
    { property: "og:image", content: imageUrl },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    {
      name: "twitter:description",
      content: description,
    },
    { name: "twitter:image", content: imageUrl },
    {
      name: "keywords",
      content: keywords,
    },
    { name: "author", content: "Ras Mic" },
    { name: "favicon", content: imageUrl },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId, sessionId } = await getAuth(args);

  // In server-side loaders, use process.env (Vite env vars are available at build time)
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not configured. Make sure it's set in your environment variables.");
  }

  // Get Clerk session token for authenticated requests
  let authToken: string | undefined;
  if (sessionId && userId) {
    try {
      const clerkClient = createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      authToken = await clerkClient.sessions.getToken(sessionId, {
        template: "convex",
      });
    } catch (error) {
      console.error("Failed to get Clerk session token:", error);
    }
  }

  // Create Convex HTTP clients - one with auth for authenticated queries,
  // one without auth for public actions
  const convexWithAuth = new ConvexHttpClient(convexUrl);
  const convexPublic = new ConvexHttpClient(convexUrl);

  // Set auth token if available (setAuth expects a function that returns a token)
  if (authToken) {
    convexWithAuth.setAuth(() => Promise.resolve(authToken!));
  }

  // Parallel data fetching to reduce waterfall
  const [subscriptionData, plans] = await Promise.all([
    userId && authToken
      ? convexWithAuth
          .query(api.subscriptions.checkUserSubscriptionStatus, { userId })
          .catch((error) => {
            console.error("Failed to fetch subscription data:", error);
            return null;
          })
      : Promise.resolve(null),
    convexPublic
      .action(api.subscriptions.getAvailablePlans)
      .catch((error) => {
        console.error("Failed to fetch plans:", error);
        return { items: [], pagination: null };
      }),
  ]);

  return {
    isSignedIn: !!userId,
    hasActiveSubscription: subscriptionData?.hasActiveSubscription || false,
    plans,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <Integrations loaderData={loaderData} />
      <ContentSection />
      <Team />
      <Pricing loaderData={loaderData} />
      <Footer />
    </>
  );
}
