# Sonido de Notificación para Mensajes Nuevos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproducir un sonido corto cuando llega un mensaje nuevo de un contacto mientras el usuario tiene `/inbox` abierto.

**Architecture:** Un hook `useNotificationSound` encapsula un único `<audio>` precargado (vía `useRef`) y expone `play()`. Se engancha en `handleMessageEvent` de `inbox/page.tsx`, filtrando por `sender_type === 'customer'` para que solo suenen mensajes entrantes, nunca los que envía el propio agente o el bot.

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

### Task 2: Enganchar el sonido en el inbox

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx:1-18` (imports)
- Modify: `src/app/(dashboard)/inbox/page.tsx:205-265` (`handleMessageEvent`)

- [ ] **Step 1: Añadir el import del hook**

En `src/app/(dashboard)/inbox/page.tsx`, junto a los demás imports de hooks (línea 12):

```typescript
import { useRealtime } from "@/hooks/use-realtime";
import { useNotificationSound } from "@/hooks/use-notification-sound";
```

- [ ] **Step 2: Instanciar el hook dentro del componente**

Dentro de `export default function InboxPage()`, junto a los demás hooks de nivel superior (cerca de la línea 35, antes de los `useState`):

```typescript
export default function InboxPage() {
  const t = useTranslations("Inbox.page");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { play: playNotificationSound } = useNotificationSound();
```

- [ ] **Step 3: Disparar el sonido en `handleMessageEvent`**

En `src/app/(dashboard)/inbox/page.tsx`, dentro de `handleMessageEvent` (línea 205), rama `event.eventType === "INSERT"` (línea 209). El bloque actual es:

```typescript
      if (event.eventType === "INSERT") {
        // Add to messages if it belongs to active conversation
        if (
          activeConversation &&
          newMsg.conversation_id === activeConversation.id
        ) {
```

Se modifica a:

```typescript
      if (event.eventType === "INSERT") {
        if (newMsg.sender_type === "customer") {
          playNotificationSound();
        }

        // Add to messages if it belongs to active conversation
        if (
          activeConversation &&
          newMsg.conversation_id === activeConversation.id
        ) {
```

- [ ] **Step 4: Añadir `playNotificationSound` a las dependencias de `useCallback`**

El `useCallback` de `handleMessageEvent` cierra en (línea 264 original):

```typescript
    [activeConversation, hydrateConversation]
  );
```

Cambiar a:

```typescript
    [activeConversation, hydrateConversation, playNotificationSound]
  );
```

(`playNotificationSound` es estable entre renders porque `useNotificationSound` la envuelve en `useCallback` con deps `[]`, así que este cambio no provoca resuscripciones del canal realtime.)

- [ ] **Step 5: Verificar que compila y pasa lint**

Run: `npx tsc --noEmit && npx eslint src/app/\(dashboard\)/inbox/page.tsx src/hooks/use-notification-sound.ts`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/inbox/page.tsx"
git commit -m "feat: play notification sound on inbound WhatsApp messages"
```

---

### Task 3: Verificación manual end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el entorno de desarrollo**

Run: `npm run dev`

- [ ] **Step 2: Abrir `/inbox` en el navegador y confirmar que el archivo carga**

Navegar a `http://localhost:3000/inbox` (ajustar puerto si difiere), abrir devtools → Network, y confirmar que `GET /sounds/new-message.mp3` devuelve 200 la primera vez que llega un mensaje (o precargar manualmente visitando `http://localhost:3000/sounds/new-message.mp3` directamente para confirmar que el archivo se sirve).

- [ ] **Step 3: Enviar un mensaje de prueba entrante**

Desde un número de WhatsApp real conectado al `whatsapp_config` de prueba, enviar un mensaje al número del CRM. Confirmar:
- El sonido `new-message.mp3` suena en el navegador.
- No aparece ningún error en la consola del navegador.

- [ ] **Step 4: Confirmar que enviar un mensaje desde el CRM NO dispara el sonido**

Desde `/inbox`, responder a una conversación existente usando el composer. Confirmar que el sonido **no** suena (ese INSERT tiene `sender_type: 'agent'`).

- [ ] **Step 5: Confirmar que mensajes automáticos de bot/flow tampoco disparan el sonido**

Si hay un flow o auto-respuesta de IA configurado en el entorno de prueba, disparar una respuesta automática y confirmar que no suena (ese INSERT tiene `sender_type: 'bot'`). Si no hay ninguno configurado, omitir este paso — ya está cubierto por el filtro `sender_type === 'customer'` verificado en el código.

- [ ] **Step 6: Confirmar que mensajes consecutivos rápidos vuelven a sonar**

Enviar dos mensajes de WhatsApp seguidos con pocos segundos de diferencia (antes de que termine de sonar el primero). Confirmar que el segundo mensaje también dispara el sonido desde el inicio (no se pisan ni se silencian).
