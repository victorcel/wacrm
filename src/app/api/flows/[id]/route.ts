import { NextResponse } from 'next/server'
import { requireFeature, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * GET   /api/flows/[id]  — fetch one flow with its nodes.
 * PUT   /api/flows/[id]  — replace name/trigger/entry/fallback + the
 *                          full node graph (delete-then-insert under
 *                          the hood; not atomic, but the runner is
 *                          resilient to mid-edit reads — node_not_found
 *                          gracefully ends the run).
 * DELETE /api/flows/[id] — hard delete (RLS+CASCADE clean up nodes,
 *                          runs, events).
 *
 * All three require an active subscription + feature access for flows.
 * Ownership is enforced via RLS on the user-scoped client.
 */

interface PutBody {
  name?: string
  description?: string | null
  trigger_type?: 'keyword' | 'first_inbound_message' | 'manual'
  trigger_config?: Record<string, unknown>
  entry_node_id?: string | null
  fallback_policy?: Record<string, unknown>
  nodes?: Array<{
    node_key: string
    node_type: string
    config: Record<string, unknown>
    position_x?: number
    position_y?: number
  }>
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  try {
    const ctx = await requireFeature('flows', 'agent')
    // RLS scopes to caller's account
    const { data: exists } = await ctx.supabase
      .from('flows')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [{ data: flow }, { data: nodes }] = await Promise.all([
      ctx.supabase.from('flows').select('*').eq('id', id).maybeSingle(),
      ctx.supabase
        .from('flow_nodes')
        .select('*')
        .eq('flow_id', id)
        .order('created_at', { ascending: true }),
    ])
    if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ flow, nodes: nodes ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  try {
    const ctx = await requireFeature('flows', 'agent')

    const body = (await request.json().catch(() => null)) as PutBody | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    }

    // Ownership check via RLS before write
    const { data: exists } = await ctx.supabase
      .from('flows')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const admin = supabaseAdmin()

    const flowPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (body.name !== undefined) flowPatch.name = body.name.trim()
    if (body.description !== undefined) flowPatch.description = body.description
    if (body.trigger_type !== undefined) flowPatch.trigger_type = body.trigger_type
    if (body.trigger_config !== undefined) flowPatch.trigger_config = body.trigger_config
    if (body.entry_node_id !== undefined) flowPatch.entry_node_id = body.entry_node_id
    if (body.fallback_policy !== undefined) flowPatch.fallback_policy = body.fallback_policy

    const { error: updErr } = await admin.from('flows').update(flowPatch).eq('id', id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    if (body.nodes !== undefined) {
      const { error: delErr } = await admin.from('flow_nodes').delete().eq('flow_id', id)
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      if (body.nodes.length > 0) {
        const { error: insErr } = await admin.from('flow_nodes').insert(
          body.nodes.map((n) => ({
            flow_id: id,
            node_key: n.node_key,
            node_type: n.node_type,
            config: n.config,
            position_x: n.position_x ?? 0,
            position_y: n.position_y ?? 0,
          })),
        )
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }

    const [{ data: flow }, { data: nodes }] = await Promise.all([
      admin.from('flows').select('*').eq('id', id).maybeSingle(),
      admin
        .from('flow_nodes')
        .select('*')
        .eq('flow_id', id)
        .order('created_at', { ascending: true }),
    ])
    return NextResponse.json({ flow, nodes: nodes ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  try {
    const ctx = await requireFeature('flows', 'agent')

    // Ownership check via RLS before delete
    const { data: exists } = await ctx.supabase
      .from('flows')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { error } = await supabaseAdmin().from('flows').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
