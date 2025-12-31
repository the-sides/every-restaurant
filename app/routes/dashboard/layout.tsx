import { getAuth } from "@clerk/react-router/ssr.server";
import { ConvexHttpClient } from "convex/browser";
import { redirect, useLoaderData } from "react-router";
import { AppSidebar } from "~/components/dashboard/app-sidebar";
import { SiteHeader } from "~/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { api } from "../../../convex/_generated/api";
import type { Route } from "./+types/layout";
import { createClerkClient } from "@clerk/react-router/api.server";
import { Outlet } from "react-router";

export async function loader(args: Route.LoaderArgs) {
  const { userId, sessionId } = await getAuth(args);

  // Redirect to sign-in if not authenticated
  if (!userId) {
    throw redirect("/sign-in");
  }

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

  if (!authToken) {
    throw redirect("/sign-in");
  }

  // Create Convex HTTP client with auth
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(() => Promise.resolve(authToken!));

  // Parallel data fetching to reduce waterfall
  const [subscriptionStatus, user] = await Promise.all([
    convex
      .query(api.subscriptions.checkUserSubscriptionStatus, { userId })
      .catch((error) => {
        console.error("Failed to fetch subscription status:", error);
        return { hasActiveSubscription: false };
      }),
    createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    }).users.getUser(userId)
  ]);

  // Redirect to subscription-required if no active subscription
  if (!subscriptionStatus?.hasActiveSubscription) {
    throw redirect("/subscription-required");
  }

  return { user };
}

export default function DashboardLayout() {
  const { user } = useLoaderData();

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
