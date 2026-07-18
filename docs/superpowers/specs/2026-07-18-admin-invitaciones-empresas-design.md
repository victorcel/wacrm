# Fix de invitaciones de miembros + gestión de empresas en /admin

## Contexto

Dos bugs reportados en el módulo admin:

1. **Crear empresa (owner)**: funciona correctamente hoy — descartado tras revisión, no requiere cambios.
2. **Invitar miembro a una empresa**: cuando el invitado acepta, queda como **empresa nueva** en vez de unirse a la empresa que lo invitó (caso real: Yesica Medrano, tuvo que moverse a mano).

### Investigación (causa raíz confirmada)

El flujo de invitación de miembros (Settings → Miembros → "Invitar miembro" → link `/join/<token>`) depende de:

- [`account_invitations`](../../../supabase/migrations/019_invitation_rpcs.sql) + RPC `redeem_invitation` — mueve al invitado de su cuenta personal a la del invitador.
- [`handle_new_user`](../../../supabase/migrations/017_account_sharing.sql#L659) — trigger que crea la cuenta personal del invitado al registrarse.
- `emailRedirectTo` en [signup](../../../src/app/(auth)/signup/page.tsx#L68) → apunta a `/join/<token>` para que, tras confirmar el email, el usuario vuelva a la pantalla de aceptar.

Se reprodujo el flujo completo contra el proyecto Supabase real con datos temporales (creados y eliminados en la misma sesión):

- `redeem_invitation` ejecutada como usuario real: **funciona** — mueve el profile al account correcto con el rol de la invitación.
- `handle_new_user`: **funciona** — crea account + profile `owner` correctamente.
- **`generate_link` (el mismo mecanismo que envía el email de confirmación) con `redirect_to=https://<dominio>/join/<token>` devuelve un `action_link` cuyo `redirect_to` real es `http://localhost:3000` — el token se pierde.** Reproducido también pidiendo explícitamente `http://localhost:3000/join/<token>`: igual se colapsa a `http://localhost:3000` sin el path.

**Causa raíz:** en el dashboard de Supabase (Authentication → URL Configuration), el **Site URL** está en `http://localhost:3000` y la lista de **Redirect URLs** no incluye el dominio de producción con `/join/*`. Supabase solo honra `emailRedirectTo`/`redirect_to` si la URL solicitada matchea la allow-list; si no, cae al Site URL. El invitado confirma su email, aterriza sin el token de invitación, nunca ve el botón "Aceptar invitación", y se queda con la cuenta personal que `handle_new_user` le creó al registrarse — que es la "empresa nueva" del síntoma.

Segundo hallazgo, relacionado con el pedido del usuario de "liberar miembro / reasignar / editar empresa": `accounts.owner_user_id` tiene `ON DELETE RESTRICT` (confirmado intentando borrar un usuario de prueba: falló con `23503` hasta borrar primero su `account`). Hoy no hay UI para reasignar un miembro entre empresas ni para eliminar una empresa, lo que hace que estados rotos (como el de Yesica) solo se puedan arreglar a mano en la base de datos.

## Alcance

Incluye:
1. Fix del flujo de confirmación de email (config Supabase + código defensivo).
2. Editar nombre de empresa desde `/admin`.
3. Reasignar un miembro a otra empresa, o liberarlo a su propia cuenta, desde `/admin`.
4. Eliminar una empresa desde `/admin`.

No incluye (fuera de este spec):
- Banner de "invitación pendiente" en el dashboard del usuario (red de seguridad adicional, se evalúa después si el fix principal no es suficiente).
- Cambios al flujo de creación de empresa (owner) — confirmado que funciona.
- Migración/limpieza de datos rotos existentes en producción (el usuario los corrige a mano).

## Diseño

### 1. Fix del flujo de confirmación de email

**Config de Supabase (manual, fuera del repo — el usuario la aplica):**
- Site URL → dominio real de producción.
- Redirect URLs → agregar el dominio de producción con wildcard (p.ej. `https://<dominio>/**`), cubriendo `/join/*` y `/auth/confirm`.

**Código — nuevo route de confirmación server-side**, para que el intercambio de sesión no dependa de que el navegador ya tenga cookies válidas al aterrizar en `/join/<token>`, y como defensa en profundidad si la config de Supabase vuelve a desalinearse:

- Nuevo archivo `src/app/auth/confirm/route.ts` (Route Handler, GET). Sigue el patrón oficial de Supabase SSR: recibe `token_hash` + `type` (los parámetros que Supabase agrega al link del email) y `next` (la URL de destino final, p.ej. `/join/<token>`), llama `supabase.auth.verifyOtp({ token_hash, type })` con el cliente server (`@/lib/supabase/server`), y si tiene éxito redirige a `next` con la sesión ya en cookies. Si falla, redirige a `/login?error=confirm_failed`.
- `emailRedirectTo` en [signup/page.tsx](../../../src/app/(auth)/signup/page.tsx#L68) cambia de:
  ```
  `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
  ```
  a:
  ```
  `${window.location.origin}/auth/confirm?next=${encodeURIComponent(`/join/${inviteToken}`)}`
  ```
  y, para el signup sin invitación (caso genérico, hoy sin `emailRedirectTo` explícito — usa el default de Supabase), se fija igualmente a `/auth/confirm?next=/dashboard` para que ambos casos pasen por el mismo mecanismo de intercambio server-side.

### 2. Editar empresa

- Nuevo endpoint `PATCH /api/admin/companies/[accountId]/route.ts`, protegido con `requirePlatformAdmin()` (mismo patrón que [`/api/admin/companies/[accountId]/subscription`](../../../src/app/api/admin/companies/[accountId]/subscription/route.ts)). Body `{ name: string }`, valida no-vacío, hace `admin.from("accounts").update({ name }).eq("id", accountId)`.
- UI: botón "Editar" en la fila de la tabla de [`admin-dashboard.tsx`](../../../src/app/(dashboard)/admin/admin-dashboard.tsx), abre un dialog simple (mismo patrón visual que `CreateCompanyDialog`) con un input de nombre.

### 3. Reasignar / liberar miembro entre empresas

**Nueva RPC** `platform_reassign_member(p_user_id UUID, p_target_account_id UUID, p_new_role account_role_enum)` en una nueva migración `041_platform_member_reassign.sql`, hermana de `remove_account_member` (018) pero para el super-admin — no scoped a "cuenta del caller":

- Verifica `EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())`, si no → `42501`.
- Si `p_target_account_id` es `NULL` → mismo comportamiento que `remove_account_member`: crea una cuenta personal nueva para el usuario y lo deja `owner` ahí ("liberar").
- Si `p_target_account_id` tiene valor → verifica que la cuenta destino exista, mueve `profiles.account_id = p_target_account_id, account_role = p_new_role` (rechaza `p_new_role = 'owner'`; usar `transfer_account_ownership` para eso, mismo criterio que 018).
- No permite mover al `owner_user_id` actual del account de origen si es el único miembro con `owner_user_id` apuntando a él sin reasignar primero el ownership — misma regla defensiva de `018`; si el target es owner, error `22023` pidiendo transferir ownership antes.

**Endpoint** `POST /api/admin/members/[userId]/reassign` — body `{ targetAccountId: string | null, role?: AccountRole }`, `requirePlatformAdmin()`, delega a la RPC, mapea `42501`→403, `22023`→400 (mismo patrón que [`/api/account/members/[userId]`](../../../src/app/api/account/members/[userId]/route.ts)).

**UI**: la tabla de empresas gana una fila expandible o un dialog "Miembros" por empresa (reutiliza `fetchAccountMembers`-like pero cross-account vía un nuevo `GET /api/admin/companies/[accountId]/members`) listando cada miembro con un selector "Mover a empresa..." (dropdown de empresas existentes) + botón "Liberar (cuenta propia)".

### 4. Eliminar empresa

- Nueva RPC `platform_delete_account(p_account_id UUID)` en la misma migración 041. Verifica platform_admin. Rechaza si hay **más de un** miembro (fuerza reasignar/liberar miembros primero vía `platform_reassign_member` — evita borrados accidentales con pérdida de acceso). Si queda exactamente un miembro (el owner), lo libera automáticamente primero (mismo efecto que `platform_reassign_member(p_user_id, NULL, NULL)`: le crea una cuenta personal nueva y lo deja `owner` ahí) para que nunca quede un profile huérfano, y solo entonces `DELETE FROM accounts` — que en ese punto ya no tiene ningún profile apuntándole, así que no choca con el `ON DELETE RESTRICT` de `owner_user_id`. Devuelve el `id` de la cuenta personal nueva del owner liberado (o `NULL` si el account ya estaba vacío).
- Endpoint `DELETE /api/admin/companies/[accountId]/route.ts`.
- UI: botón "Eliminar" en la tabla, con `ConfirmDialog` (mismo componente que "Suspender"), destructivo, mensaje explícito de que solo funciona si la empresa no tiene miembros (o solo el owner) y sugiere reasignar primero si falla.

## Testing

- Fix de confirmación: crear una invitación de prueba, registrarse con un email real accesible, confirmar que el link de confirmación lleva a `/join/<token>` con sesión activa y el botón "Aceptar invitación" funciona de punta a punta (esto requiere que el usuario ya haya actualizado la config de Supabase — no se puede probar en el entorno de desarrollo sin ese paso).
- `platform_reassign_member`: test manual vía `/admin` — mover un miembro de una empresa a otra, verificar `profiles.account_id`/`account_role` actualizados y que el miembro pierde acceso a los datos de la empresa origen (RLS).
- `platform_delete_account`: intentar borrar una empresa con 2+ miembros → debe rechazar; reasignar/liberar hasta dejar 0-1 miembros → debe permitir.
- Regresión: confirmar que crear empresa (owner) sigue funcionando sin cambios (no tocado por este spec).
