'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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

const STATUS_KEYS: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  suspended: 'suspended',
  expired: 'expired',
  inactive: 'inactive',
};

const STATUS_CLASSNAMES: Record<string, string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  trialing: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  suspended: 'border-destructive/40 bg-destructive/10 text-destructive',
  expired: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
  inactive: 'border-border bg-muted text-muted-foreground',
};

function UsageBar({
  label,
  used,
  max,
  unlimitedLabel,
}: {
  label: string;
  used: number;
  max: number | null;
  unlimitedLabel: string;
}) {
  const percent = max !== null && max > 0 ? Math.min((used / max) * 100, 100) : null;
  const nearLimit = percent !== null && percent >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {used} / {max !== null ? max : unlimitedLabel}
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
  const t = useTranslations('Settings.subscription');
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
          setError(t('loadError'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  function formatDate(iso: string | null): string {
    if (!iso) return t('noExpiration');
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

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
        {error ?? t('noData')}
      </p>
    );
  }

  const statusKey = STATUS_KEYS[data.status] ?? 'inactive';
  const statusClassName = STATUS_CLASSNAMES[statusKey];

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      {/* Plan summary card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('currentPlan')}
            </p>
            <p className="mt-1 text-lg font-bold text-foreground">
              {data.plan?.name ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusClassName}>{t(`status.${statusKey}`)}</Badge>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t('validUntil')}</span>
          {formatDate(data.periodEnd)}
        </div>
      </div>

      {/* Usage card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        <p className="text-sm font-semibold text-foreground">{t('planUsage')}</p>

        <UsageBar
          label={t('seatsLabel')}
          used={data.seats.used}
          max={data.seats.max}
          unlimitedLabel={t('unlimited')}
        />

        <UsageBar
          label={t('broadcastsLabel')}
          used={data.broadcasts.thisMonth}
          max={data.broadcasts.max}
          unlimitedLabel={t('unlimited')}
        />
      </div>
    </div>
  );
}
