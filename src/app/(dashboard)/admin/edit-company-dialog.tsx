"use client";

// ============================================================
// EditCompanyDialog
//
// Renames a company. Mirrors RecordPaymentDialog's shape: `company`
// prop doubles as the open/closed flag (open = company !== null).
// ============================================================

import { useEffect, useState } from "react";
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

interface EditCompanyDialogProps {
  company: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditCompanyDialog({
  company,
  onOpenChange,
  onSaved,
}: EditCompanyDialogProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Seed the input whenever a new company is opened.
  useEffect(() => {
    if (company) setName(company.name);
  }, [company]);

  async function handleSubmit() {
    if (!company) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "No se pudo renombrar la empresa");
        return;
      }
      toast.success("Empresa renombrada");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("[EditCompanyDialog] error:", err);
      toast.error("No se pudo contactar el servidor. ¿Reintentar?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!company} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            Editar empresa
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Cambia el nombre de la empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label className="text-muted-foreground">Nombre de la empresa</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-muted border-border text-foreground"
          />
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
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
