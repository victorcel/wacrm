"use client";

import { useEffect } from "react";
import { Inter } from "next/font/google";
import { RotateCw, TriangleAlert } from "lucide-react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DEFAULT_MODE, DEFAULT_THEME } from "@/lib/themes";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

// Last-resort boundary for errors thrown in the root layout itself.
// Unlike error.tsx, this replaces the root layout when active, so it
// must render its own <html>/<body> and pull in global styles + the
// font. The theme boot script doesn't run here either, so we pin the
// default mode/accent — the token CSS still resolves from those.
export default function GlobalError({
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
    <html
      lang="es"
      data-theme={DEFAULT_THEME}
      data-mode={DEFAULT_MODE}
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
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
                Ocurrió un error inesperado al cargar la aplicación. Vuelve a
                intentarlo en unos instantes.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button className="w-full" onClick={() => unstable_retry()}>
                <RotateCw />
                Reintentar
              </Button>
              {error.digest ? (
                <p className="text-center text-xs text-muted-foreground/70">
                  Código de error:{" "}
                  <span className="font-mono">{error.digest}</span>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </body>
    </html>
  );
}