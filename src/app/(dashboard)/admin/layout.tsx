import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth/platform";

export const metadata: Metadata = {
  title: "Administración · TRAFIKOS",
  robots: { index: false, follow: false, nocache: true },
};

// Secondary guard for the /admin area. The (dashboard) parent layout
// already checks isPlatformAdmin() via getCurrentAccount(); this adds
// an explicit hard-stop so non-platform-admins can never reach these
// routes even if the parent gate is bypassed.
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

  return <>{children}</>;
}
