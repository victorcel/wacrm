// One-off: reply to jevduque with the "2_buscar_servicios" quick reply,
// exercising the BSUID send path end to end. Verbose on purpose.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const ACC = '20b39555-5699-497c-9e88-29e0e3a736b8'
const CONTACT = 'cf3d616b-732e-41cb-bd1e-9370f7693cad' // oldest jevduque row
const BSUID = 'CO.1410291337649017'

// --- the quick reply ---------------------------------------------------
const { data: qr } = await db.from('quick_replies').select('*')
  .eq('account_id', ACC).eq('title', '2_buscar_servicios').single()
const p = qr.interactive_payload
console.log('quick reply:', qr.title, '| kind:', p.kind)
console.log('payload:', JSON.stringify(p, null, 2).slice(0, 700))

// --- decrypt the WhatsApp token (mirrors src/lib/whatsapp/encryption.ts) --
const { data: cfg } = await db.from('whatsapp_config').select('*').eq('account_id', ACC).single()
// Mirrors src/lib/whatsapp/encryption.ts exactly:
//   GCM (current): <iv-hex>:<ciphertext-hex>:<authTag-hex>
//   CBC (legacy):  <iv-hex>:<ciphertext-hex>
function decrypt(payload, keyHex) {
  const key = Buffer.from(keyHex, 'hex')
  const parts = payload.split(':')
  if (parts.length === 3) {
    const [ivHex, ctHex, tagHex] = parts
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    d.setAuthTag(Buffer.from(tagHex, 'hex'))
    return d.update(ctHex, 'hex', 'utf8') + d.final('utf8')
  }
  const [ivHex, ctHex] = parts
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'))
  return d.update(ctHex, 'hex', 'utf8') + d.final('utf8')
}
let token
try { token = decrypt(cfg.access_token, env.ENCRYPTION_KEY) } catch (e) {
  console.error('no pude descifrar el token:', e.message); process.exit(1)
}
console.log('phone_number_id:', cfg.phone_number_id, '| token len:', token.length)

// --- 1) set the BSUID on the contact (minimal, additive) ---------------
const { error: upErr } = await db.from('contacts')
  .update({ bsuid: BSUID, updated_at: new Date().toISOString() }).eq('id', CONTACT)
console.log('\nset bsuid:', upErr ? `FALLO — ${upErr.message}` : 'OK')
if (upErr) process.exit(1)

// --- 2) build EXACTLY what src/lib/whatsapp/meta-api.ts builds ---------
const isBsuid = /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{1,128}$/.test(BSUID)
const recipientFields = isBsuid ? { recipient: BSUID } : { to: BSUID }

const interactive = {
  type: 'list',
  body: { text: p.body },
  action: {
    button: p.button_label,
    sections: p.sections.map((s) => ({
      ...(s.title ? { title: s.title } : {}),
      rows: s.rows.map((r) => ({
        id: r.id, title: r.title,
        ...(r.description ? { description: r.description } : {}),
      })),
    })),
  },
}
if (p.header) interactive.header = { type: 'text', text: p.header }
if (p.footer) interactive.footer = { text: p.footer }

const body = {
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  ...recipientFields,
  type: 'interactive',
  interactive,
}
console.log('\n--- POST body a Meta ---')
console.log(JSON.stringify(body, null, 2))

// --- 3) send ------------------------------------------------------------
const url = `https://graph.facebook.com/v25.0/${cfg.phone_number_id}/messages`
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
})
const text = await res.text()
console.log('\n--- respuesta de Meta ---')
console.log('HTTP', res.status)
console.log(text)

if (!res.ok) {
  console.log('\n>>> ENVIO FALLIDO — nada que persistir')
  process.exit(0)
}

// --- 4) persist so the inbox reflects it -------------------------------
const wamid = JSON.parse(text).messages?.[0]?.id
const { data: conv } = await db.from('conversations').select('id')
  .eq('contact_id', CONTACT).order('created_at', { ascending: true }).limit(1).single()
const { error: msgErr } = await db.from('messages').insert({
  conversation_id: conv.id,
  sender_type: 'agent',
  content_type: 'interactive',
  content_text: p.body,
  interactive_payload: p,
  message_id: wamid,
  status: 'sent',
})
console.log('\npersistido en el inbox:', msgErr ? `FALLO — ${msgErr.message}` : `OK (wamid ${wamid})`)
if (!msgErr) {
  await db.from('conversations').update({
    last_message_text: p.body, last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', conv.id)
}
