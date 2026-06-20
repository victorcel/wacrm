import Link from "next/link";
import { Compass } from "lucide-react";

import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Root not-found UI. Next renders this for `notFound()` calls and for
// any unmatched URL across the app, so a dead link should still feel
// on-brand. Mirrors the suspended page's centered card.
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="justify-items-center text-center">
          <BrandWordmark className="mx-auto mb-3 block h-9 w-auto" />
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Compass className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl text-foreground">
            Página no encontrada
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            La página que buscas no existe o fue movida. Comprueba la dirección
            o vuelve al inicio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link href="/" className={buttonVariants({ className: "w-full" })}>
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}