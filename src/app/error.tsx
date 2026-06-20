"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Route-level error boundary. Next renders this Client Component when a
// segment below the root layout throws. `unstable_retry` re-fetches and
// re-renders the failed segment (Next 16.2) — preferred over the older
// `reset` for recovering from transient failures.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="justify-items-center text-center">
          <BrandWordmark className="mx-auto mb-3 block h-9 w-auto" />
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
            <TriangleAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl text-foreground">
            Algo salió mal
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Ocurrió un error inesperado. Puedes intentarlo de nuevo o volver al
            inicio. Si el problema persiste, contacta con el administrador de la
            plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button className="w-full" onClick={() => unstable_retry()}>
            <RotateCw />
            Reintentar
          </Button>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            Volver al inicio
          </Link>
          {error.digest ? (
            <p className="text-center text-xs text-muted-foreground/70">
              Código de error:{" "}
              <span className="font-mono">{error.digest}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}