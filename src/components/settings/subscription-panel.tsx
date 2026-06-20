'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { SettingsPanelHead } from './settings-panel-head';

interface UsageData {
  plan: {
    key: string;
    name: string;
    maxSeats: number | null;
    maxBroadcastsPerMonth: number | null;
  } | null;
  status: string;
  periodEnd: string | null;
  seats: { used: number; max: number | null };
  broadcasts: { thisMonth: number; max: number | null };
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Activa',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  },
  trialing: {
    label: 'Período de prueba',
    className: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  },
  suspended: {
    label: 'Suspendida',
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  expired: {
    label: 'Vencida',
    className: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
  },
  inactive: {
    label: 'Inactiva',
    className: 'border-border bg-muted text-muted-foreground',
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin vencimiento';
  const d = new Date(iso);
  return d.toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number | null;
}) {
  const percent = max !== null && max > 0 ? Math.min((used / max) * 100, 100) : null;
  const nearLimit = percent !== null && percent >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {used} / {max !== null ? max : 'Ilimitado'}
        </span>
      </div>
      {percent !== null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              nearLimit ? 'bg-orange-500' : 'bg-primary'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SubscriptionPanel() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/account/subscription-usage')
      .then((r) => r.json())
      .then((d: UsageData) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('No se pudo cargar la información de suscripción.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {error ?? 'Sin datos'}
      </p>
    );
  }

  const statusInfo = STATUS_META[data.status] ?? STATUS_META.inactive;

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Suscripción"
        description="Plan activo, límites de uso y fecha de renovación de tu espacio de trabajo."
      />

      {/* Plan summary card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Plan actual
            </p>
            <p className="mt-1 text-lg font-bold text-foreground">
              {data.plan?.name ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Válido hasta: </span>
          {formatDate(data.periodEnd)}
        </div>
      </div>

      {/* Usage card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        <p className="text-sm font-semibold text-foreground">Uso del plan</p>

        <UsageBar
          label="Asientos (miembros)"
          used={data.seats.used}
          max={data.seats.max}
        />

        <UsageBar
          label="Difusiones este mes"
          used={data.broadcasts.thisMonth}
          max={data.broadcasts.max}
        />
      </div>
    </div>
  );
}
