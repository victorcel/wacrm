"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PlanRow {
  id: string;
  key: string;
  name: string;
  price_amount: number | null;
  currency: string;
  max_seats: number | null;
  max_broadcasts_per_month: number | null;
  features: Record<string, boolean>;
  is_active: boolean;
  sort_order: number;
}

// One entry per gatable module — keys match exactly the `featureKey`
// values in the sidebar so enabling/disabling here controls nav visibility.
const KNOWN_FEATURES: { key: string; label: string }[] = [
  { key: "inbox", label: "Bandeja de entrada" },
  { key: "contacts", label: "Contactos" },
  { key: "pipelines", label: "Embudos" },
  { key: "broadcasts", label: "Difusiones" },
  { key: "automations", label: "Automatizaciones" },
  { key: "flows", label: "Flujos" },
];

function LimitText(value: number | null): string {
  return value === null ? "Ilimitado" : value.toLocaleString("es-CO");
}

function FeatureChip({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        enabled
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-muted text-muted-foreground line-through"
      }`}
    >
      {label}
    </span>
  );
}

interface UpsertPlanDialogProps {
  plan: PlanRow | null; // null = create mode
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function UpsertPlanDialog({
  plan,
  open,
  onOpenChange,
  onSaved,
}: UpsertPlanDialogProps) {
  const isEdit = !!plan;
  const [name, setName] = useState(plan?.name ?? "");
  const [key, setKey] = useState(plan?.key ?? "");
  const [priceAmount, setPriceAmount] = useState(
    plan?.price_amount != null ? String(plan.price_amount) : "",
  );
  const [currency, setCurrency] = useState(plan?.currency ?? "COP");
  const [maxSeats, setMaxSeats] = useState(
    plan?.max_seats != null ? String(plan.max_seats) : "",
  );
  const [maxBroadcasts, setMaxBroadcasts] = useState(
    plan?.max_broadcasts_per_month != null
      ? String(plan.max_broadcasts_per_month)
      : "",
  );
  // Materialise all known features explicitly so the toggle always
  // has a definite true/false — a missing key defaults to "enabled"
  // (allowed) per the platform rule, so we pre-fill true for any
  // key absent from the saved plan.
  const [features, setFeatures] = useState<Record<string, boolean>>(() => {
    const saved = plan?.features ?? {};
    const init: Record<string, boolean> = {};
    for (const { key: fk } of KNOWN_FEATURES) {
      init[fk] = saved[fk] !== false;
    }
    // Carry over any non-standard keys from the saved plan as-is.
    for (const [k, v] of Object.entries(saved)) {
      if (!(k in init)) init[k] = v;
    }
    return init;
  });
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);

  function toggleFeature(featureKey: string) {
    setFeatures((prev) => ({ ...prev, [featureKey]: !prev[featureKey] }));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("El nombre del plan es obligatorio");
      return;
    }
    if (!isEdit && !key.trim()) {
      toast.error("La clave del plan es obligatoria");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        priceAmount: priceAmount !== "" ? Number(priceAmount) : 0,
        currency: currency.trim() || "COP",
        maxSeats: maxSeats !== "" ? Number(maxSeats) : null,
        maxBroadcastsPerMonth: maxBroadcasts !== "" ? Number(maxBroadcasts) : null,
        features,
        isActive,
      };
      if (isEdit) {
        payload.id = plan.id;
      } else {
        payload.key = key.trim();
      }

      const res = await fetch("/api/admin/plans", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "No se pudo guardar el plan");
        return;
      }
      toast.success(isEdit ? "Plan actualizado" : "Plan creado");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("[UpsertPlanDialog]", err);
      toast.error("No se pudo contactar el servidor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {isEdit ? `Editar plan · ${plan.name}` : "Crear plan"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit
              ? "Actualiza los límites y características de este plan."
              : "Define un nuevo plan de suscripción."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name + Key */}
          <div className={`grid gap-3 ${isEdit ? "" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Nombre del plan</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Básico"
                className="bg-muted border-border text-foreground"
              />
            </div>
            {!isEdit && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  Clave{" "}
                  <span className="text-xs">(única, no editable)</span>
                </Label>
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder="basic"
                  className="bg-muted border-border text-foreground"
                />
              </div>
            )}
          </div>

          {/* Price + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Precio mensual</Label>
              <Input
                type="number"
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
                placeholder="0"
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Moneda</Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="COP"
                maxLength={3}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                Máx. asientos{" "}
                <span className="text-xs">(vacío = ilimitado)</span>
              </Label>
              <Input
                type="number"
                value={maxSeats}
                onChange={(e) => setMaxSeats(e.target.value)}
                placeholder="Ilimitado"
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                Máx. difusiones/mes{" "}
                <span className="text-xs">(vacío = ilimitado)</span>
              </Label>
              <Input
                type="number"
                value={maxBroadcasts}
                onChange={(e) => setMaxBroadcasts(e.target.value)}
                placeholder="Ilimitado"
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          {/* Feature toggles */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Funciones incluidas</Label>
            <div className="flex flex-wrap gap-2">
              {KNOWN_FEATURES.map(({ key: fk, label }) => {
                const enabled = features[fk] !== false;
                return (
                  <button
                    key={fk}
                    type="button"
                    onClick={() => toggleFeature(fk)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      enabled
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {enabled ? "✓" : "✗"} {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Haz clic en una función para activarla o desactivarla.
            </p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Plan activo</p>
              <p className="text-xs text-muted-foreground">
                Los planes inactivos no aparecen en el selector al crear empresas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 translate-x-0 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  isActive ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando...
              </>
            ) : isEdit ? (
              "Guardar cambios"
            ) : (
              "Crear plan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PlansPanelProps {
  plans: PlanRow[];
  onUpdated: () => void;
}

export function PlansPanel({ plans, onUpdated }: PlansPanelProps) {
  const [editTarget, setEditTarget] = useState<PlanRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function openEdit(plan: PlanRow) {
    setEditTarget(plan);
    setEditOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Planes de suscripción</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Configura los límites y funciones incluidas en cada plan.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="size-4" />
          Crear plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-14 text-center text-sm text-muted-foreground">
          No hay planes. Crea el primero con el botón de arriba.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-foreground">{plan.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{plan.key}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    className={
                      plan.is_active
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-border bg-muted text-muted-foreground"
                    }
                  >
                    {plan.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(plan)}
                    aria-label={`Editar ${plan.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Price */}
              <div className="text-sm">
                <span className="text-2xl font-bold text-foreground">
                  {plan.price_amount != null
                    ? plan.price_amount.toLocaleString("es-CO")
                    : "0"}
                </span>
                <span className="ml-1 text-muted-foreground">
                  {plan.currency}/mes
                </span>
              </div>

              {/* Limits */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Asientos</span>
                  <span className="font-medium text-foreground">
                    {LimitText(plan.max_seats)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Difusiones/mes</span>
                  <span className="font-medium text-foreground">
                    {LimitText(plan.max_broadcasts_per_month)}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div className="flex flex-wrap gap-1.5">
                {KNOWN_FEATURES.map(({ key: fk, label }) => (
                  <FeatureChip
                    key={fk}
                    enabled={plan.features[fk] !== false}
                    label={label}
                  />
                ))}
                {/* Surface any extra non-standard features */}
                {Object.entries(plan.features)
                  .filter(([k]) => !KNOWN_FEATURES.some((f) => f.key === k))
                  .map(([k, v]) => (
                    <FeatureChip key={k} enabled={v} label={k} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editTarget && (
        <UpsertPlanDialog
          plan={editTarget}
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditTarget(null);
          }}
          onSaved={onUpdated}
        />
      )}

      {/* Create dialog */}
      <UpsertPlanDialog
        plan={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={onUpdated}
      />
    </div>
  );
}
