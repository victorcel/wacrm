import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth/platform";

export const metadata: Metadata = {
  title: "Administración · TRAFIKOS",
  robots: { index: false, follow: false, nocache: true },
};

// Server guard for the whole /admin area. Only platform super-admins
// get in; everyone else (no session, or a normal account user) is
// bounced to /login. The API routes under /api/admin enforce the same
// check independently, so this is the UI-level gate.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePlatformAdmin();
  } catch {
    redirect("/login");
  }

  return <div className="min-h-screen bg-background">{children}</div>;
}
