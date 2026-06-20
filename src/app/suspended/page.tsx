"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";

// Shown by the dashboard gate when an account has no active
// subscription (never activated, expired, or suspended). Lives
// outside the (dashboard) route group so it is itself ungated.
export default function SuspendedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <BrandWordmark className="mx-auto mb-3 block h-9 w-auto" />
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <AlertCircle className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle className="text-xl text-foreground">
            Suscripción inactiva
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Tu cuenta no tiene una suscripción activa o tu periodo de pago ha
            vencido. Para reactivar el acceso, contacta con el administrador de
            la plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            onClick={handleSignOut}
            disabled={loading}
            variant="outline"
            className="w-full border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {loading ? "Cerrando sesión..." : "Cerrar sesión"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
