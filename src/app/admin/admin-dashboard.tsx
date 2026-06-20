"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { BrandWordmark } from "@/components/brand-wordmark";

import { CreateCompanyDialog, type PlanOption } from "./create-company-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { formatDate, statusMeta } from "./utils";

interface Company {
  id: string;
  name: string;
  createdAt: string;
  ownerEmail: string | null;
  memberCount: number;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    planKey: string | null;
    planName: string | null;
  } | null;
}

interface Plan extends PlanOption {
  isActive: boolean;
}

export function AdminDashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<{ id: string; name: string } | null>(
    null,
  );

  const loadData = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/admin/companies"),
        fetch("/api/admin/plans"),
      ]);
      if (cRes.ok) {
        const data = await cRes.json();
        setCompanies(data.companies ?? []);
      } else {
        toast.error("No se pudieron cargar las empresas");
      }
      if (pRes.ok) {
        const data = await pRes.json();
        setPlans(
          (data.plans ?? []).map(
            (p: { id: string; name: string; key: string; is_active: boolean }) => ({
              id: p.id,
              name: p.name,
              key: p.key,
              isActive: p.is_active,
            }),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function patchSubscription(
    companyId: string,
    body: Record<string, unknown>,
  ) {
    const res = await fetch(`/api/admin/companies/${companyId}/subscription`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      toast.error(payload.error || "No se pudo actualizar");
      return;
    }
    await loadData();
  }

  async function toggleStatus(c: Company) {
    const active = c.subscription?.status === "active";
    await patchSubscription(c.id, { status: active ? "suspended" : "active" });
    toast.success(active ? "Suscripción suspendida" : "Suscripción activada");
  }

  async function changePlan(companyId: string, planId: string) {
    await patchSubscription(companyId, { planId });
    toast.success("Plan actualizado");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const activePlans = plans.filter((p) => p.isActive);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandWordmark className="block h-7 w-auto" />
          <span className="text-sm text-muted-foreground">· Plataforma</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            Crear empresa
          </Button>
          <Button
            variant="outline"
            onClick={signOut}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cerrar sesión
          </Button>
        </div>
      </header>

      <h1 className="mb-1 text-2xl font-semibold text-foreground">Empresas</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Gestiona las cuentas de empresa, sus planes y suscripciones.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center text-muted-foreground">
          Aún no hay empresas. Crea la primera con el botón de arriba.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pagado hasta</TableHead>
                <TableHead className="text-center">Miembros</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => {
                const status = c.subscription?.status ?? null;
                const meta = statusMeta(status);
                const currentPlanId =
                  plans.find((p) => p.key === c.subscription?.planKey)?.id ?? "";
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.ownerEmail ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={currentPlanId}
                        onValueChange={(v) => v && changePlan(c.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[140px] bg-muted border-border text-foreground">
                          <SelectValue placeholder={c.subscription?.planName ?? "—"} />
                        </SelectTrigger>
                        <SelectContent>
                          {plans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge className={meta.className}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(c.subscription?.currentPeriodEnd ?? null)}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {c.memberCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPayTarget({ id: c.id, name: c.name })}
                          className="border-border text-muted-foreground hover:bg-muted"
                        >
                          Registrar pago
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleStatus(c)}
                          className="border-border text-muted-foreground hover:bg-muted"
                        >
                          {status === "active" ? "Suspender" : "Activar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateCompanyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        plans={activePlans}
        onCreated={loadData}
      />
      <RecordPaymentDialog
        company={payTarget}
        onOpenChange={(next) => {
          if (!next) setPayTarget(null);
        }}
        onRecorded={loadData}
      />
    </div>
  );
}
