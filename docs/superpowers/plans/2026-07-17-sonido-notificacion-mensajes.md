# Sonido de Notificación para Mensajes Nuevos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproducir un sonido corto cuando llega un mensaje nuevo de un contacto, sin importar en qué pantalla del dashboard esté el usuario (no solo en `/inbox`).

**Architecture:** Un hook `useNotificationSound` encapsula un único `<audio>` precargado (vía `useRef`) y expone `play()`. Un componente headless nuevo, `NewMessageSoundListener`, abre su propio canal Supabase Realtime (mismo patrón que `useTotalUnread`/`useUnreadNotifications`) escuchando INSERTs en `messages`, filtra por `sender_type === 'customer'`, y llama a `play()`. Se monta una sola vez en `DashboardShellInner` (junto a `PresenceHeartbeat`), por lo que suena en cualquier ruta del dashboard mientras la pestaña esté abierta.

**Revisión de alcance (post-implementación inicial):** Las Tasks 1-2 originales enganchaban el sonido dentro de `handleMessageEvent` en `inbox/page.tsx`, alcance que luego se amplió a "toda la app". Mantener ambos enganches sonaría el mensaje dos veces cuando el usuario está dentro de `/inbox`. La Task 2 de este plan revierte ese enganche específico de `inbox/page.tsx` (Task 2 original, ya commiteada) y lo reemplaza por el listener global — dejando el sonido en un único lugar.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, HTML5 `<audio>` (Web API nativa, sin librerías nuevas).

**Nota sobre testing:** El proyecto usa Vitest con `environment: "node"` (sin jsdom ni `@testing-library/react` instalados — ver `vitest.config.ts`). Los tests existentes (`src/lib/*.test.ts`) cubren lógica pura de librería, no componentes/hooks React. `useNotificationSound` depende de `HTMLAudioElement`, que no existe en `node` puro; instalar jsdom solo para este hook de ~15 líneas sería una dependencia nueva desproporcionada para el alcance del spec. Este plan usa verificación manual en navegador (tal como especifica el spec) en vez de TDD automatizado para este hook. El resto del proyecto no tiene tests de hooks/componentes con los que mantener consistencia.

---

### Task 1: Crear el hook `useNotificationSound`

**Files:**
- Create: `src/hooks/use-notification-sound.ts`

- [ ] **Step 1: Escribir el hook**

```typescript
"use client";

import { useCallback, useRef } from "react";

const NOTIFICATION_SOUND_SRC = "/sounds/new-message.mp3";

/**
 * Plays a short notification sound. Uses a single preloaded <audio>
 * element instead of constructing a new one per call so consecutive
 * messages don't stack up playback lag, and resets currentTime before
 * each play() so a message arriving mid-sound restarts it from zero
 * rather than being silently dropped by the still-playing instance.
 */
export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    if (typeof window === "undefined") return;

    if (!audioRef.current) {
      audioRef.current = new Audio(NOTIFICATION_SOUND_SRC);
    }

    const audio = audioRef.current;
    audio.currentTime = 0;
    // Browsers block autoplay without prior user interaction; by the
    // time a message arrives the user is already active in /inbox, but
    // swallow the rejection anyway so an occasional block never surfaces
    // as a console error or breaks the realtime handler.
    audio.play().catch(() => {});
  }, []);

  return { play };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores relacionados a `use-notification-sound.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-notification-sound.ts
git commit -m "feat: add useNotificationSound hook for new-message alerts"
```

---

### Task 2: Revertir el enganche local y crear el listener global

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx` (revertir el enganche de la Task 2 original)
- Create: `src/components/notifications/new-message-sound-listener.tsx`
- Modify: `src/app/(dashboard)/dashboard-shell.tsx` (montar el listener)

- [ ] **Step 1: Revertir el enganche en `inbox/page.tsx`**

Este repositorio ya tiene commiteado un cambio (task previa) que añadió el import de `useNotificationSound`, su instanciación, el disparo en `handleMessageEvent`, y la entrada en el `useCallback` deps array. Revertir esos 4 puntos exactamente, dejando `inbox/page.tsx` como estaba antes de esa task:

1. Quitar el import:
```typescript
import { useNotificationSound } from "@/hooks/use-notification-sound";
```

2. Quitar la instanciación del hook (línea justo después de `deepLinkConvId`):
```typescript
  const { play: playNotificationSound } = useNotificationSound();
```

3. Quitar el bloque disparador dentro de `handleMessageEvent`, rama `INSERT`:
```typescript
        if (newMsg.sender_type === "customer") {
          playNotificationSound();
        }

```
(dejando la línea en blanco original antes de `// Add to messages if it belongs to active conversation`)

4. Quitar `playNotificationSound` del `useCallback` deps array, volviendo a:
```typescript
    [activeConversation, hydrateConversation]
  );
```

Verificar con `git diff` que el archivo resultante es idéntico a como estaba en el commit previo a la Task 2 original (`7e50e78`) — puedes confirmar con:
```bash
git diff 7e50e78 -- "src/app/(dashboard)/inbox/page.tsx"
```
Expected: sin diferencias.

- [ ] **Step 2: Crear el componente `NewMessageSoundListener`**

```typescript
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import type { Message } from "@/types";

/**
 * Headless, app-wide listener for inbound WhatsApp messages. Mounted
 * once in the dashboard shell (like PresenceHeartbeat) so the
 * notification sound plays regardless of which page the user is on,
 * not just while /inbox is open. Own realtime channel — same pattern
 * as useTotalUnread/useUnreadNotifications — so it doesn't interfere
 * with the inbox page's "inbox-realtime" channel.
 */
export function NewMessageSoundListener() {
  const { play } = useNotificationSound();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("new-message-sound")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_type === "customer") {
            play();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [play]);

  return null;
}
```

- [ ] **Step 3: Montar el listener en el shell del dashboard**

En `src/app/(dashboard)/dashboard-shell.tsx`, añadir el import junto a `PresenceHeartbeat`:

```typescript
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { NewMessageSoundListener } from "@/components/notifications/new-message-sound-listener";
```

Y montarlo junto a `<PresenceHeartbeat />` dentro de `DashboardShellInner`:

```typescript
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <NewMessageSoundListener />
```

- [ ] **Step 4: Verificar que compila y pasa lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(dashboard)/inbox/page.tsx" "src/app/(dashboard)/dashboard-shell.tsx" src/components/notifications/new-message-sound-listener.tsx`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/inbox/page.tsx" "src/app/(dashboard)/dashboard-shell.tsx" src/components/notifications/new-message-sound-listener.tsx
git commit -m "feat: play new-message sound app-wide instead of only in /inbox"
```

---

### Task 3: Verificación manual end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el entorno de desarrollo**

Run: `npm run dev`

- [ ] **Step 2: Abrir el dashboard en el navegador y confirmar que el archivo carga**

Navegar a cualquier ruta del dashboard, p.ej. `http://localhost:3000/contacts` (ajustar puerto si difiere), abrir devtools → Network, y confirmar que `GET /sounds/new-message.mp3` devuelve 200 (o precargar manualmente visitando `http://localhost:3000/sounds/new-message.mp3` directamente para confirmar que el archivo se sirve).

- [ ] **Step 3: Confirmar que suena estando FUERA de `/inbox`**

Con el navegador en una pantalla distinta a `/inbox` (p.ej. `/contacts`, `/notifications`, `/settings`), enviar un mensaje de WhatsApp de prueba real al número conectado. Confirmar:
- El sonido `new-message.mp3` suena aunque `/inbox` no esté abierto.
- No aparece ningún error en la consola del navegador.

- [ ] **Step 4: Confirmar que suena UNA sola vez estando DENTRO de `/inbox`**

Con el navegador en `/inbox`, enviar otro mensaje de prueba. Confirmar que el sonido suena **exactamente una vez** (no dos) — esto valida que la reversión de la Task 2 original eliminó el enganche duplicado y solo queda el listener global.

- [ ] **Step 5: Confirmar que enviar un mensaje desde el CRM NO dispara el sonido**

Desde `/inbox`, responder a una conversación existente usando el composer. Confirmar que el sonido **no** suena (ese INSERT tiene `sender_type: 'agent'`).

- [ ] **Step 6: Confirmar que mensajes automáticos de bot/flow tampoco disparan el sonido**

Si hay un flow o auto-respuesta de IA configurado en el entorno de prueba, disparar una respuesta automática y confirmar que no suena (ese INSERT tiene `sender_type: 'bot'`). Si no hay ninguno configurado, omitir este paso — ya está cubierto por el filtro `sender_type === 'customer'` verificado en el código.

- [ ] **Step 7: Confirmar que mensajes consecutivos rápidos vuelven a sonar**

Enviar dos mensajes de WhatsApp seguidos con pocos segundos de diferencia (antes de que termine de sonar el primero). Confirmar que el segundo mensaje también dispara el sonido desde el inicio (no se pisan ni se silencian).
