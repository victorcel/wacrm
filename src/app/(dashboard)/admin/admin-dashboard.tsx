"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { CreateCompanyDialog, type PlanOption } from "./create-company-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { PaymentHistoryDialog } from "./payment-history-dialog";
import { PlansPanel, type PlanRow } from "./plans-panel";
import { formatDate, statusMeta } from "./utils";

interface Company {
  id: string;
  name: string;
  createdAt: string;
  ownerEmail: string | null;
  memberCount: number;
  isSuperAdminAccount: boolean;
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
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<{ id: string; name: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Company | null>(null);
  const [suspending, setSuspending] = useState(false);

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
        const raw: PlanRow[] = data.plans ?? [];
        setPlanRows(raw);
        setPlans(
          raw.map((p) => ({
            id: p.id,
            name: p.name,
            key: p.key,
            isActive: p.is_active,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function patchSubscription(companyId: string, body: Record<string, unknown>) {
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

  async function confirmSuspend() {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      await patchSubscription(suspendTarget.id, { status: "suspended" });
      toast.success("Suscripción suspendida");
      setSuspendTarget(null);
    } finally {
      setSuspending(false);
    }
  }

  async function activateCompany(c: Company) {
    await patchSubscription(c.id, { status: "active" });
    toast.success("Suscripción activada");
  }

  async function changePlan(companyId: string, planId: string) {
    await patchSubscription(companyId, { planId });
    toast.success("Plan actualizado");
  }

  const activePlans = plans.filter((p) => p.isActive);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Panel de administración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestiona empresas, planes de suscripción y pagos.
        </p>
      </div>

      <Tabs defaultValue="companies">
        <TabsList variant="line" className="border-b border-border w-full justify-start rounded-none px-0">
          <TabsTrigger value="companies">Empresas</TabsTrigger>
          <TabsTrigger value="plans">Planes</TabsTrigger>
        </TabsList>

        {/* ── Empresas tab ─────────────────────────────────────── */}
        <TabsContent value="companies" className="mt-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {loading ? "Cargando…" : `${companies.length} empresa${companies.length === 1 ? "" : "s"}`}
              </p>
              <Button
                onClick={() => setCreateOpen(true)}
                className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="size-4" />
                Crear empresa
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : companies.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-16 text-center text-sm text-muted-foreground">
                Aún no hay empresas. Crea la primera con el botón de arriba.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
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
                            {c.isSuperAdminAccount ? (
                              <span className="text-sm text-muted-foreground">
                                {c.subscription?.planName ?? "—"}
                              </span>
                            ) : (
                              <Select
                                value={currentPlanId}
                                onValueChange={(v) => v && changePlan(c.id, v)}
                              >
                                <SelectTrigger className="h-8 w-[140px] bg-muted border-border text-foreground">
                                  <SelectValue placeholder={c.subscription?.planName ?? "—"}>
                                    {(value) =>
                                      plans.find((p) => p.id === value)?.name ??
                                      c.subscription?.planName ??
                                      "—"
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {plans.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
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
                            {c.isSuperAdminAccount ? (
                              <span className="text-xs text-muted-foreground italic">
                                Super-admin
                              </span>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setHistoryTarget({ id: c.id, name: c.name })}
                                  className="border-border text-muted-foreground hover:bg-muted"
                                >
                                  Ver pagos
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPayTarget({ id: c.id, name: c.name })}
                                  className="border-border text-muted-foreground hover:bg-muted"
                                >
                                  Registrar pago
                                </Button>
                                {status === "active" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSuspendTarget(c)}
                                    className="border-border text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  >
                                    Suspender
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => activateCompany(c)}
                                    className="border-border text-muted-foreground hover:bg-muted"
                                  >
                                    Activar
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Planes tab ───────────────────────────────────────── */}
        <TabsContent value="plans" className="mt-5">
          <PlansPanel plans={planRows} onUpdated={loadData} />
        </TabsContent>
      </Tabs>

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
      <PaymentHistoryDialog
        company={historyTarget}
        onOpenChange={(next) => {
          if (!next) setHistoryTarget(null);
        }}
      />
      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(next) => { if (!next) setSuspendTarget(null); }}
        title="¿Suspender empresa?"
        description={`La empresa "${suspendTarget?.name}" perderá acceso inmediatamente. Podrás reactivarla en cualquier momento.`}
        confirmLabel="Suspender"
        cancelLabel="Cancelar"
        destructive
        loading={suspending}
        onConfirm={confirmSuspend}
      />
    </div>
  );
}
