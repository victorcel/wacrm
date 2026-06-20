"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PAYMENT_METHODS, formatDate } from "./utils";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  method: string | null;
  paidAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  note: string | null;
  planName: string | null;
}

interface PaymentHistoryDialogProps {
  company: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}

function methodLabel(value: string | null): string {
  if (!value) return "—";
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-CO")}`;
  }
}

export function PaymentHistoryDialog({
  company,
  onOpenChange,
}: PaymentHistoryDialogProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!company) return;
    setLoading(true);
    fetch(`/api/admin/companies/${company.id}/payments`)
      .then((r) => r.json())
      .then((d) => setPayments(d.payments ?? []))
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, [company?.id]);

  return (
    <Dialog
      open={!!company}
      onOpenChange={(next) => {
        if (!next) setPayments([]);
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            Historial de pagos{company ? ` · ${company.name}` : ""}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Registro de todos los pagos manuales asociados a esta empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aún no hay pagos registrados para esta empresa.
            </p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border bg-muted/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-base font-semibold text-foreground">
                        {formatCurrency(p.amount, p.currency)}
                      </span>
                      {p.planName && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · {p.planName}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.paidAt)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      <span className="text-foreground/60">Método:</span>{" "}
                      {methodLabel(p.method)}
                    </span>
                    <span>
                      <span className="text-foreground/60">Período:</span>{" "}
                      {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                    </span>
                    {p.note && (
                      <span>
                        <span className="text-foreground/60">Nota:</span>{" "}
                        {p.note}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
