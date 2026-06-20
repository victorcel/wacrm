"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toEndOfDayISO, PAYMENT_METHODS } from "./utils";

export interface PlanOption {
  id: string;
  name: string;
  key: string;
}

interface CreateCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: PlanOption[];
  onCreated: () => void;
}

export function CreateCompanyDialog({
  open,
  onOpenChange,
  plans,
  onCreated,
}: CreateCompanyDialogProps) {
  const [companyName, setCompanyName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [planId, setPlanId] = useState("");
  const [paidUntil, setPaidUntil] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCompanyName("");
    setOwnerEmail("");
    setOwnerName("");
    setPlanId("");
    setPaidUntil("");
    setAmount("");
    setMethod("");
    setNote("");
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!companyName || !ownerEmail || !planId || !paidUntil) {
      toast.error("Empresa, correo, plan y fecha de pago son obligatorios");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          ownerEmail,
          ownerName: ownerName || undefined,
          planId,
          paidUntil: toEndOfDayISO(paidUntil),
          amount: amount ? Number(amount) : undefined,
          method: method || undefined,
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "No se pudo crear la empresa");
        return;
      }
      toast.success("Empresa creada. Se envió la invitación por correo.");
      onCreated();
      onOpenChange(false);
      reset();
    } catch (err) {
      console.error("[CreateCompanyDialog] error:", err);
      toast.error("No se pudo contactar el servidor. ¿Reintentar?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            Crear empresa
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Se invitará al administrador por correo (Supabase envía el enlace
            para establecer su contraseña). El plan queda activo hasta la fecha
            indicada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Nombre de la empresa</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme S.A."
              className="bg-muted border-border text-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Correo del admin</Label>
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="admin@acme.com"
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Nombre del admin</Label>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Juan Pérez"
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Plan</Label>
              <Select value={planId} onValueChange={(v) => v && setPlanId(v)}>
                <SelectTrigger className="w-full bg-muted border-border text-foreground">
                  <SelectValue placeholder="Elegir plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Pagado hasta</Label>
              <Input
                type="date"
                value={paidUntil}
                onChange={(e) => setPaidUntil(e.target.value)}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                Monto <span className="text-xs">(opcional)</span>
              </Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="29"
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                Método <span className="text-xs">(opcional)</span>
              </Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? "")}>
                <SelectTrigger className="w-full bg-muted border-border text-foreground">
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              Nota <span className="text-xs">(opcional)</span>
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Referencia del pago"
              className="bg-muted border-border text-foreground"
            />
          </div>
        </div>

        <DialogFooter className="bg-popover border-border">
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
                Creando...
              </>
            ) : (
              "Crear empresa"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
