<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/brand/wordmark-dark.png">
    <img src="./public/brand/wordmark-teal.png" alt="TRAFIKOS" width="320">
  </picture>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](./LICENSE)
[![CI](https://github.com/ArnasDon/wacrm/actions/workflows/ci.yml/badge.svg)](https://github.com/ArnasDon/wacrm/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?logo=supabase)](https://supabase.com)
[![Stars](https://img.shields.io/github/stars/ArnasDon/wacrm?style=social)](https://github.com/ArnasDon/wacrm/stargazers)

The marketing site and self-host docs live in a separate repo:
[ArnasDon/wacrm-site](https://github.com/ArnasDon/wacrm-site)
([wacrm.tech](https://wacrm.tech)). This repo is the product —
clone or fork it to run your own CRM.

## What you get out of the box

- **Shared inbox** on the official WhatsApp Business API — multiple
  agents working one number, per-conversation assignment, status, and
  notes.
- **Contacts + tags + custom fields**, CSV import, deduplication.
- **Sales pipelines** (Kanban) with deals linked to conversations.
- **Broadcasts** with Meta-approved templates, delivery + read
  tracking, per-recipient variable substitution.
- **No-code automations** — triggers on inbound messages, new
  contacts, keywords, or schedule; conditional branches, waits,
  tags, webhooks. Visual builder.
- **AI reply assistant** — bring your own OpenAI or Anthropic key
  (stored encrypted; no per-seat AI fee, your data stays yours).
  One-click AI-drafted replies in the inbox, plus an optional
  auto-reply bot with a per-conversation cap and clean human handoff.
  Add a **knowledge base** (FAQs, policies, product docs) and it
  answers from your own content — hybrid retrieval (Postgres full-text,
  or semantic pgvector when an embeddings key is set).
- **Real-time dashboard** — response times, daily volume, pipeline
  value, cross-module activity feed.
- **Team accounts** — invite teammates by link, role-based access
  (owner / admin / agent / viewer), ownership transfer. Every install
  is account-scoped, so one shared inbox can be staffed by a whole
  team. Solo use stays single-user with zero setup.
- **Account management** — email, password, avatar, global sign-out.
- **Public REST API** (`/api/v1`) with scoped, revocable API keys —
  build your own automations on top of your CRM. See
  [docs/public-api.md](./docs/public-api.md).
- **MCP server** — drive your CRM from Claude, Cursor, and other AI
  assistants over the [Model Context Protocol](https://modelcontextprotocol.io).
  Read-only by default, opt-in writes. See [docs/mcp.md](./docs/mcp.md)
  (server in [`mcp-server/`](./mcp-server)).

## Why fork this?

This is a **template**, not a product. Forking means you get:

- **Full ownership** — your code, your Supabase project, your domain,
  your data. No SaaS lock-in, no seat pricing, no trust dance.
- **Full customisation** — add the fields your team needs, remove the
  modules you don't, redesign anything. The stack is boring on
  purpose (Next.js + Supabase + Tailwind) so the learning curve is
  short.
- **Zero ops to start** — [Hostinger](https://www.hostinger.com/web-apps-hosting)
  Managed Node.js deploys a fork in a few clicks. No Docker, no
  Kubernetes, no infra team needed.
  ([See below ↓](#-deploy-on-hostinger-recommended))
- **Real security primitives** — token encryption (AES-256-GCM), RLS
  on every table, HMAC-verified webhooks, CSP, rate limiting, CI
  typecheck/build on every PR.

Not a framework. Not an SDK. A concrete, working CRM you can stand up
in an afternoon and make yours.

## Quick start

```bash
# Fork on GitHub first: https://github.com/ArnasDon/wacrm → Fork
git clone https://github.com/<your-username>/wacrm.git
cd wacrm
npm install
cp .env.local.example .env.local   # fill in Supabase + Meta creds
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login` (or
`/dashboard` if already signed in).

## 🚀 Deploy on Hostinger (recommended)

<p align="center">
  <strong>CRM autoalojable para WhatsApp®</strong><br>
  Bandeja compartida, contactos, embudos de venta, difusiones y
  automatizaciones sin código — todo sobre la API oficial de WhatsApp Business.
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/Licencia-MIT-00d6ae.svg" alt="Licencia MIT"></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js 16"></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?logo=supabase" alt="Supabase"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript" alt="TypeScript"></a>
</p>

---

## ¿Qué es TRAFIKOS?

TRAFIKOS es un **CRM para WhatsApp** pensado para equipos de ventas y
atención. Unifica todas las conversaciones de un número de WhatsApp
Business en una bandeja compartida, conecta cada chat con contactos y
embudos de venta, y permite automatizar respuestas y difusiones sin
escribir código.

Se distribuye como una plataforma con **registro cerrado y
suscripción gestionada**: las empresas no se auto-registran, sino que
un super-administrador las da de alta, define su plan y administra los
pagos desde un panel dedicado.

## Funcionalidades

- **Bandeja compartida** sobre la API oficial de WhatsApp Business —
  varios agentes sobre un mismo número, con asignación, estado y notas
  por conversación.
- **Contactos** con etiquetas y campos personalizados, importación CSV
  y deduplicación.
- **Embudos de venta** (Kanban) con negocios vinculados a las
  conversaciones.
- **Difusiones** con plantillas aprobadas por Meta, seguimiento de
  entrega y lectura, y sustitución de variables por destinatario.
- **Automatizaciones sin código** — disparadores por mensaje entrante,
  contacto nuevo, palabra clave o agenda; ramas condicionales, esperas,
  etiquetas y webhooks. Constructor visual de flujos.
- **Dashboard en tiempo real** — tiempos de respuesta, volumen diario,
  valor del embudo y feed de actividad entre módulos.
- **Cuentas de equipo** — invitación por enlace, acceso por roles
  (propietario / administrador / agente / lector) y transferencia de
  propiedad. Cada instalación está aislada por cuenta.
- **Panel de super-administrador** (`/admin`) — alta de empresas,
  activación y suspensión, gestión de planes (asientos, difusiones,
  funcionalidades) y registro de pagos manuales.
- **API REST pública** (`/api/v1`) con claves de API revocables y con
  alcance limitado. Ver [docs/public-api.md](./docs/public-api.md).

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Datos** — Supabase (Postgres + Auth + Storage + RLS).
- **WhatsApp** — Meta Cloud API (API oficial de WhatsApp Business).
- **Seguridad** — cifrado de tokens (AES-256-GCM), RLS en cada tabla,
  webhooks verificados con HMAC, CSP y rate limiting.

## Inicio rápido

```bash
git clone https://github.com/victorcel/wacrm.git
cd wacrm
npm install
cp .env.local.example .env.local   # completa Supabase + Meta
npm run dev
```

Abre <http://localhost:3000>. Se redirige a `/login` (o a `/dashboard`
si ya iniciaste sesión).

### Primer super-administrador

El registro es cerrado, así que el primer super-admin se crea fuera de
banda con el script de _seed_ (lee `SUPER_ADMIN_*` de `.env.local`):

```bash
npm run seed:admin
```

Después podrás dar de alta empresas y planes desde `/admin`.

## Variables de entorno

Copia `.env.local.example` a `.env.local` y completa:

| Variable | Para qué sirve |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (anon) de Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service-role (panel de admin, server-only). |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` / `SUPER_ADMIN_NAME` | Credenciales del primer super-admin (`npm run seed:admin`). |
| `ENCRYPTION_KEY` | Cifrado de tokens de WhatsApp (64 hex / 32 bytes). |
| `META_APP_SECRET` | Verificación HMAC de los webhooks de Meta. |
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio (enlaces, webhooks). |

## Scripts

```bash
npm run dev          # servidor de desarrollo
npm run build        # build de producción
npm run start        # servir el build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest
npm run seed:admin   # crea el primer super-administrador
```

## Despliegue

TRAFIKOS corre en cualquier entorno con Node.js ≥ 20 (Hostinger,
Vercel, Railway o tu propio VPS). El flujo recomendado es desplegar con
**Hostinger Managed Node.js**: conecta el repositorio, define las
variables de entorno en hPanel y haz push a `main` para construir y
servir — sin Docker ni configuración de servidor.

> Requisito clave: HTTPS activo (necesario para el webhook de WhatsApp
> Business). Hostinger emite SSL automático con Let's Encrypt.

## Licencia

[MIT](./LICENSE). TRAFIKOS está basado en el template open source
[wacrm](https://github.com/ArnasDon/wacrm) de Arnas Donauskas.
