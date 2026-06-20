// GET /api/admin/me
// Returns { isPlatformAdmin: true } if the caller is a platform super-admin,
// otherwise 403. Used by the client sidebar to conditionally show the /admin link.
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    await requirePlatformAdmin();
    return NextResponse.json({ isPlatformAdmin: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
