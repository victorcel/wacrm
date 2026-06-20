import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "./dashboard-shell";
import { getCurrentAccount } from "@/lib/auth/account";
import { isPlatformAdmin } from "@/lib/auth/platform";

// Server layout whose only job is to declare "do not index" metadata
// for the authed app. robots.ts already disallows these paths at the
// crawler-level and middleware redirects unauthenticated visitors, so
// this is belt-and-suspenders — but SEO-critical if a URL ever leaks
// via a link shared externally.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Subscription gate — the single access checkpoint for the whole
  // authed app. None of the CRM feature code knows about billing;
  // it all sits behind this one redirect. Platform admins are exempt
  // (they run the platform, not a paying account).
  let allowed = false;
  try {
    const ctx = await getCurrentAccount();
    allowed =
      ctx.subscription.isActive || (await isPlatformAdmin(ctx.userId));
  } catch {
    // No session / profile not linked to an account. Middleware
    // usually catches the no-session case first; this is the
    // belt-and-suspenders fallback.
    redirect("/login");
  }

  if (!allowed) {
    redirect("/suspended");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
