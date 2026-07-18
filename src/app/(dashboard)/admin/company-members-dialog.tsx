"use client";

// ============================================================
// CompanyMembersDialog
//
// Lists every member of one company and lets the platform admin
// move a member to a different company, or release them to their
// own fresh personal account. Read model is independent of Settings
// → Miembros (that one is self-service, RLS-scoped to the caller's
// own account); this one reads cross-account via /api/admin/*.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Member {
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  joined_at: string;
}

interface CompanyMembersDialogProps {
  company: { id: string; name: string } | null;
  allCompanies: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
}

const MOVE_ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "agent", label: "Agente" },
  { value: "viewer", label: "Lector" },
];

export function CompanyMembersDialog({
  company,
  allCompanies,
  onOpenChange,
}: CompanyMembersDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  // Per-row pending selection: "release" or a target company id.
  const [destination, setDestination] = useState<Record<string, string>>({});
  const [role, setRole] = useState<Record<string, string>>({});

  const loadMembers = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/members`);
      if (!res.ok) {
        toast.error("No se pudieron cargar los miembros");
        return;
      }
      const data = (await res.json()) as { members: Member[] };
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function applyMove(userId: string) {
    const dest = destination[userId];
    if (!dest) {
      toast.error("Elige un destino primero");
      return;
    }
    setBusyUserId(userId);
    try {
      const body =
        dest === "release"
          ? { targetAccountId: null }
          : { targetAccountId: dest, role: role[userId] ?? "agent" };

      const res = await fetch(`/api/admin/members/${userId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "No se pudo mover al miembro");
        return;
      }
      toast.success(
        dest === "release" ? "Miembro liberado a su propia cuenta" : "Miembro movido",
      );
      await loadMembers();
    } catch (err) {
      console.error("[CompanyMembersDialog] reassign error:", err);
      toast.error("No se pudo contactar el servidor. ¿Reintentar?");
    } finally {
      setBusyUserId(null);
    }
  }

  const otherCompanies = allCompanies.filter((c) => c.id !== company?.id);

  return (
    <Dialog open={!!company} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            Miembros{company ? ` · ${company.name}` : ""}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Mueve un miembro a otra empresa o libéralo a su propia cuenta.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin miembros.</p>
            ) : (
              members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex flex-col gap-2 rounded-md border border-border p-3"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {m.full_name || m.email || m.user_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.email ?? "—"} · {m.role}
                    </div>
                  </div>

                  {m.role === "owner" ? (
                    <p className="text-xs text-muted-foreground italic">
                      Es el propietario; transfiere la propiedad antes de moverlo.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={destination[m.user_id] ?? ""}
                        onValueChange={(v) =>
                          v && setDestination((d) => ({ ...d, [m.user_id]: v }))
                        }
                      >
                        <SelectTrigger className="h-8 w-[200px] bg-muted border-border text-foreground">
                          <SelectValue placeholder="Elegir destino..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="release">
                            Liberar (cuenta propia)
                          </SelectItem>
                          {otherCompanies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              Mover a: {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {destination[m.user_id] &&
                        destination[m.user_id] !== "release" && (
                          <Select
                            value={role[m.user_id] ?? "agent"}
                            onValueChange={(v) =>
                              v && setRole((r) => ({ ...r, [m.user_id]: v }))
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] bg-muted border-border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MOVE_ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                      <Button
                        size="sm"
                        disabled={busyUserId === m.user_id || !destination[m.user_id]}
                        onClick={() => applyMove(m.user_id)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        {busyUserId === m.user_id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Aplicar"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
