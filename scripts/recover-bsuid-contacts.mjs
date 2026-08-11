#!/usr/bin/env node
// ============================================================
// One-off repair: recover BSUIDs for contacts orphaned by the
// pre-044 username bug, and merge the duplicates they fanned out into.
//
// Background. Before migration 044 the inbound webhook read only
// `message.from`. Meta omits that field for customers who reach us
// through a WhatsApp username, so every such message was attributed to
// a contact with `phone = ''` and no identity at all: the phone lookup
// bailed on the empty string, so each message minted a fresh contact
// AND a fresh conversation. Those rows could never be replied to —
// the send path had nothing to address.
//
// The identity was not actually lost. Meta's inbound `wamid` is
// base64 and embeds the sender: the phone for a normal contact, and
// the BSUID (e.g. `CO.1410291337649017`) for a username-only one. This
// script decodes it back out, writes it to `contacts.bsuid`, and
// collapses the rows that turn out to be the same person.
//
//   node scripts/recover-bsuid-contacts.mjs            # dry run (default)
//   node scripts/recover-bsuid-contacts.mjs --apply    # write
//
// Safe to re-run: contacts that already carry a bsuid are skipped.
// ============================================================

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Same grammar as src/lib/whatsapp/recipient.ts — keep in step. */
const BSUID = /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{1,128}$/

function bsuidFromWamid(wamid) {
  if (!wamid?.startsWith('wamid.')) return null
  let decoded
  try {
    decoded = Buffer.from(wamid.slice('wamid.'.length), 'base64').toString('latin1')
  } catch {
    return null
  }
  const m = decoded.match(/[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{6,128}/)
  return m && BSUID.test(m[0]) ? m[0] : null
}

// Contact-scoped children with no contact-scoped unique constraint —
// a plain re-point is safe. Mirrors migration 022's
// merge_duplicate_contacts().
//
// `conversations` is deliberately NOT in this list. It carries a UNIQUE
// (account_id, contact_id) index (migration 040), so re-pointing a
// second conversation onto the surviving contact would violate it
// immediately. Conversations are merged first, at the conversation
// level, by mergeConversations() below.
const PLAIN_CHILDREN = [
  'contact_notes',
  'deals',
  'broadcast_recipients',
  'automation_logs',
  'automation_pending_executions',
]

// Conversation-scoped children, same list migration 040 re-points.
// Moving these off a loser conversation BEFORE deleting it is what
// saves them from its ON DELETE CASCADE.
const CONVERSATION_CHILDREN = [
  'messages',
  'message_reactions',
  'deals',
  'flow_runs',
  'notifications',
  'ai_usage_log',
]

/**
 * Collapse every conversation belonging to `contactIds` into the single
 * oldest one, moving all children across first. Returns the surviving
 * conversation id, or null when the group has none.
 *
 * Done before any contact re-point so the UNIQUE (account_id,
 * contact_id) index is never transiently violated.
 */
async function mergeConversations(contactIds, apply) {
  const all = []
  for (const cid of contactIds) {
    const { data } = await db
      .from('conversations')
      .select('id, contact_id, created_at, unread_count')
      .eq('contact_id', cid)
    for (const c of data ?? []) all.push(c)
  }
  if (all.length === 0) return { survivorConv: null, losers: [] }

  all.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
  const survivorConv = all[0]
  const losers = all.slice(1)
  if (!apply || losers.length === 0) return { survivorConv, losers }

  const totalUnread = all.reduce((n, c) => n + (c.unread_count ?? 0), 0)

  for (const loser of losers) {
    for (const table of CONVERSATION_CHILDREN) {
      const { error } = await db
        .from(table)
        .update({ conversation_id: survivorConv.id })
        .eq('conversation_id', loser.id)
      if (error && !/does not exist/i.test(error.message)) {
        throw new Error(`re-point ${table} (conv ${loser.id}): ${error.message}`)
      }
    }
    const { error: delErr } = await db.from('conversations').delete().eq('id', loser.id)
    if (delErr) throw new Error(`delete conversation ${loser.id}: ${delErr.message}`)
  }

  // Re-derive the surviving thread's summary from the now-complete set,
  // exactly as migration 040 does.
  const { data: lastMsg } = await db
    .from('messages')
    .select('content_text, created_at')
    .eq('conversation_id', survivorConv.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const patch = { unread_count: totalUnread, updated_at: new Date().toISOString() }
  if (lastMsg?.length) {
    patch.last_message_text = lastMsg[0].content_text
    patch.last_message_at = lastMsg[0].created_at
  }
  const { error: convErr } = await db
    .from('conversations')
    .update(patch)
    .eq('id', survivorConv.id)
  if (convErr) throw new Error(`update surviving conversation: ${convErr.message}`)

  return { survivorConv, losers }
}

const { data: orphans, error: orphErr } = await db
  .from('contacts')
  .select('id, name, account_id, created_at')
  .eq('phone', '')
  .is('bsuid', null)
  .order('created_at', { ascending: true })

if (orphErr) {
  console.error('cannot read contacts:', orphErr.message)
  process.exit(1)
}

// Resolve each orphan to a BSUID via its inbound messages.
const resolved = []
for (const o of orphans ?? []) {
  const { data: convs } = await db.from('conversations').select('id').eq('contact_id', o.id)
  const found = new Set()
  for (const cv of convs ?? []) {
    const { data: ms } = await db
      .from('messages')
      .select('message_id')
      .eq('conversation_id', cv.id)
      .eq('sender_type', 'customer')
      .not('message_id', 'is', null)
    for (const m of ms ?? []) {
      const b = bsuidFromWamid(m.message_id)
      if (b) found.add(b)
    }
  }
  resolved.push({ ...o, bsuids: [...found] })
}

const ok = resolved.filter((r) => r.bsuids.length === 1)
const skipped = resolved.filter((r) => r.bsuids.length !== 1)

// Group by (account, bsuid): each group is ONE person. Oldest row wins —
// same survivor rule as migration 022, so the two agree.
const groups = new Map()
for (const r of ok) {
  const k = `${r.account_id}|${r.bsuids[0]}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — orphaned contacts: ${resolved.length}`)
console.log(`  resolvable: ${ok.length}   unresolvable: ${skipped.length}`)
console.log(`  distinct people: ${groups.size}   rows to merge away: ${ok.length - groups.size}\n`)

let repaired = 0
let merged = 0

for (const [key, group] of groups) {
  const bsuid = key.split('|')[1]
  const survivor = group[0] // oldest
  const losers = group.slice(1)
  const label = `${bsuid.padEnd(24)} ${JSON.stringify(survivor.name)}`

  const ids = group.map((g) => g.id)

  if (!APPLY) {
    const { survivorConv, losers: convLosers } = await mergeConversations(ids, false)
    console.log(
      `  ${label}  keep=${survivor.id.slice(0, 8)}` +
        (losers.length ? `  merge=${losers.map((l) => l.id.slice(0, 8)).join(',')}` : '') +
        `  convs=${(survivorConv ? 1 : 0) + convLosers.length}->${survivorConv ? 1 : 0}`,
    )
    repaired++
    merged += losers.length
    continue
  }

  try {
    // 1) Collapse the threads first — the UNIQUE (account_id,
    //    contact_id) index means a contact can only own one.
    const { losers: convLosers } = await mergeConversations(ids, true)

    // 2) Now the loser contacts own no conversations; move whatever
    //    else hangs off them onto the survivor.
    for (const loser of losers) {
      for (const table of PLAIN_CHILDREN) {
        const { error } = await db
          .from(table)
          .update({ contact_id: survivor.id })
          .eq('contact_id', loser.id)
        if (error && !/does not exist/i.test(error.message)) {
          throw new Error(`re-point ${table} (contact ${loser.id}): ${error.message}`)
        }
      }
    }

    // 3) Stamp the recovered identity. Done before deleting the losers
    //    so a failure here leaves a re-runnable state rather than data
    //    that has been merged away with nothing to address it by.
    const { error: upErr } = await db
      .from('contacts')
      .update({ bsuid, updated_at: new Date().toISOString() })
      .eq('id', survivor.id)
    if (upErr) throw new Error(`setting bsuid: ${upErr.message}`)
    repaired++

    for (const loser of losers) {
      const { error: delErr } = await db.from('contacts').delete().eq('id', loser.id)
      if (delErr) throw new Error(`deleting contact ${loser.id}: ${delErr.message}`)
      merged++
    }

    console.log(`  OK ${label}  (+${losers.length} contacts, +${convLosers.length} threads merged)`)
  } catch (err) {
    console.error(`  ! ${label}: ${err.message}`)
    console.error('    left partially processed — re-run the script, it is idempotent')
  }
}

console.log(`\n${APPLY ? 'repaired' : 'would repair'}: ${repaired} contacts` +
  `, ${APPLY ? 'merged' : 'would merge'} away: ${merged} duplicate rows`)

if (skipped.length) {
  console.log('\nunresolvable (no single BSUID in their inbound wamids):')
  for (const s of skipped) {
    console.log(`  ${JSON.stringify(s.name)} — found ${s.bsuids.length}`)
  }
}
if (!APPLY) console.log('\nnothing was written. re-run with --apply to commit.')
