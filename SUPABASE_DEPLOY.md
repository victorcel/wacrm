# Supabase Deployment — wacrm

## 1. Crear proyecto

[app.supabase.com](https://app.supabase.com) → New project → guardar **Database Password**.

De **Project Settings → API** copiar:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

> Plan Free para dev, **Pro** para producción (PITR, 8 GB DB, 100 GB Storage).

## 2. Auth

**Authentication → Settings → Configuration**:
- **Site URL**: `https://tudominio.com`
- **Redirect URLs**: `https://tudominio.com/**` y `http://localhost:3000/**`
- **Confirm email**: OFF (instalación privada)
- **SMTP** (recomendado): configura tu proveedor (Resend, SendGrid) en SMTP Settings

## 3. Migraciones

```bash
# CLI (recomendado — y obligatorio para este proyecto)
brew install supabase/tap/supabase
supabase link --project-ref uuqgwnkaiwgztvaxytjj
supabase db push
```

Para subir solo migraciones nuevas después del setup inicial:

```bash
supabase db push
```

Las migraciones van actualmente de **001 → 029** (`supabase/migrations/`).

> ⚠️ **Nunca dupliques el número de prefijo.** Supabase rastrea cada migración por el número del prefijo (`024`, `025`…), **no** por el nombre completo ni por hash. Si dos archivos comparten número (p. ej. `024_member_presence.sql` y `024_subscriptions.sql`), el remoto registra solo uno y **salta el otro en silencio** — la tabla, RPC o policy de ese archivo nunca se crea aunque `migration list` muestre el número como aplicado. Antes de hacer push, verifica que no haya prefijos repetidos:
>
> ```bash
> ls supabase/migrations | cut -d_ -f1 | sort | uniq -d   # no debe imprimir nada
> ```
>
> Si vas a numerar una migración nueva, usa el siguiente número libre (no reutilices uno que pudo aplicarse en otra rama).

## 4. Storage

Las migraciones `008` y `016` crean los buckets automáticamente. Verificar en **Storage → Buckets**:

| Bucket | Uso | Límite |
|---|---|---|
| `avatars` | Fotos de perfil | 2 MB |
| `flow-media` | Media para flujos | 16 MB |

Son públicos con RLS por `auth.uid()` en el path.

## 5. Realtime

En **Database → Replication**, verificar que `messages` y `conversations` estén en `supabase_realtime`.

## 6. Variables de entorno

```bash
cp .env.local.example .env.local
```

| Variable | Fuente |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `META_APP_SECRET` | Meta for Developers → App Secret |
| `META_APP_ID` | Meta for Developers → App ID |
| `SUPER_ADMIN_EMAIL` | Email del admin inicial |
| `SUPER_ADMIN_PASSWORD` | Password del admin inicial |
| `NEXT_PUBLIC_SITE_URL` | `https://tudominio.com` |

## 7. Seed admin

```bash
npm run seed:admin
```

Crea el primer super-admin con acceso a `/admin`. Idempotente.

## 8. Backups

```bash
# Manual
pg_dump --dbname=postgresql://postgres:[PASS]@db.[REF].supabase.co:6543/postgres --format=custom --no-owner --exclude-schema=extensions,storage,realtime,vault --file=wacrm-$(date +%Y%m%d).dump

# Restaurar
pg_restore --dbname=postgresql://postgres:[PASS]@db.[REF].supabase.co:6543/postgres --clean --if-exists --no-owner wacrm-20250620.dump
```

Plan Pro incluye PITR y backups diarios automáticos.

## 9. Troubleshooting rápido

| Error | Causa | Solución |
|---|---|---|
| `relation does not exist` | Migraciones no aplicadas | `supabase db push` (no ejecutar SQL manualmente) |
| `violates row-level security` | RLS bloquea | Verificar sesión activa o usar admin client |
| `Auth session missing` | Cookie de sesión no llega | Revisar `middleware.ts` y proxy/cookies |
| `JWSInvalidSignature` | JWT mismatch | Actualizar env vars al proyecto correcto |
| Webhook 401 | `META_APP_SECRET` incorrecto | Verificar App Secret en Meta for Developers |
| Migraciones no suben | CLI no linkeado | `supabase link --project-ref [REF]` |
| Número de migración registrado pero el objeto no existe (tabla/RPC ausente aunque `migration list` lo marca aplicado) | Prefijo duplicado: otra migración con el mismo número se aplicó primero y esta se saltó | Marca el número como revertido y vuelve a aplicar (las migraciones son idempotentes): `supabase migration repair --status reverted <NNN>` y luego `supabase db push --include-all` |
