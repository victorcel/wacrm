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
import { toEndOfDayISO } from "./utils";

interface RecordPaymentDialogProps {
  /** The company to record against, or null when closed. */
  company: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}

export function RecordPaymentDialog({
  company,
  onOpenChange,
  onRecorded,
}: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [paidUntil, setPaidUntil] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setAmount("");
    setMethod("");
    setPaidUntil("");
    setNote("");
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!company) return;
    if (!amount || !paidUntil) {
      toast.error("Monto y fecha 'pagado hasta' son obligatorios");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          method: method || undefined,
          periodEnd: toEndOfDayISO(paidUntil),
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "No se pudo registrar el pago");
        return;
      }
      toast.success("Pago registrado y suscripción extendida");
      onRecorded();
      onOpenChange(false);
      reset();
    } catch (err) {
      console.error("[RecordPaymentDialog] error:", err);
      toast.error("No se pudo contactar el servidor. ¿Reintentar?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={!!company}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            Registrar pago{company ? ` · ${company.name}` : ""}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Registra un pago manual. La fecha &quot;pagado hasta&quot; se
            convierte en el nuevo vencimiento y reactiva la suscripción.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Monto</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="29"
                className="bg-muted border-border text-foreground"
              />
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

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              Método <span className="text-xs">(opcional)</span>
            </Label>
            <Input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Transferencia"
              className="bg-muted border-border text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              Nota <span className="text-xs">(opcional)</span>
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Referencia"
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
                Guardando...
              </>
            ) : (
              "Registrar pago"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
