import { NextResponse } from 'next/server'
import { requireActiveSubscription, toErrorResponse } from '@/lib/auth/account'

/**
 * GET /api/account/subscription-usage
 *
 * Returns the caller's subscription plan details + current usage
 * counters (seats, broadcasts this calendar month). Used by:
 *   - Settings → Suscripción panel
 *   - Broadcast wizard pre-check (block if monthly limit is reached
 *     before inserting the broadcasts row)
 */
export async function GET() {
  try {
    const ctx = await requireActiveSubscription('agent')
    const { supabase, accountId, subscription } = ctx

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [membersRes, broadcastsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('account_id', accountId),
      supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('created_at', monthStart.toISOString()),
    ])

    return NextResponse.json({
      plan: subscription.plan
        ? {
            key: subscription.plan.key,
            name: subscription.plan.name,
            maxSeats: subscription.plan.maxSeats,
            maxBroadcastsPerMonth: subscription.plan.maxBroadcastsPerMonth,
            features: subscription.plan.features,
          }
        : null,
      status: subscription.status,
      periodEnd: subscription.periodEnd,
      seats: {
        used: membersRes.count ?? 0,
        max: subscription.plan?.maxSeats ?? null,
      },
      broadcasts: {
        thisMonth: broadcastsRes.count ?? 0,
        max: subscription.plan?.maxBroadcastsPerMonth ?? null,
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
