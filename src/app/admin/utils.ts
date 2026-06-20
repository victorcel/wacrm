// Small shared helpers for the /admin UI.

/**
 * Turn a <input type="date"> value (YYYY-MM-DD) into an ISO timestamp
 * at the end of that local day, so "paid until June 30" stays active
 * through all of June 30 rather than expiring at midnight.
 */
export function toEndOfDayISO(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59`).toISOString();
}

/** Format an ISO timestamp (or null) for display. null = "Sin vencimiento". */
export function formatDate(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  return new Date(iso).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Human label + colour class for a subscription status. */
export function statusMeta(status: string | null): {
  label: string;
  className: string;
} {
  switch (status) {
    case "active":
      return { label: "Activa", className: "bg-emerald-500/15 text-emerald-400" };
    case "trialing":
      return { label: "Prueba", className: "bg-sky-500/15 text-sky-400" };
    case "suspended":
      return { label: "Suspendida", className: "bg-amber-500/15 text-amber-400" };
    case "expired":
      return { label: "Vencida", className: "bg-red-500/15 text-red-400" };
    default:
      return { label: "Inactiva", className: "bg-muted text-muted-foreground" };
  }
}
