# Sonido de notificación para mensajes nuevos

## Contexto

El inbox de WhatsApp (`/inbox`) ya tiene notificaciones visuales funcionando correctamente: badge de no leídos en el sidebar (`useTotalUnread`), contador por conversación (`unread_count`), y actualización en tiempo real vía Supabase Realtime (`useRealtime`, `src/hooks/use-realtime.ts`). Lo único que falta es un **aviso sonoro** cuando llega un mensaje nuevo de un contacto, para que el usuario se entere sin tener que mirar la pantalla.

## Alcance

- Solo dentro de `/inbox` (`src/app/(dashboard)/inbox/page.tsx`), que es donde ya existe la suscripción realtime activa a la tabla `messages`.
- El sonido suena **siempre** que llega un mensaje entrante, sin importar si la conversación está activa/visible o no, y sin importar el foco de la pestaña.
- No incluye: control de mute/volumen en la UI, notificaciones fuera de `/inbox`, Notification API del navegador, ni Service Worker/push.

## Diseño

### Archivo de audio

`public/sounds/new-message.mp3` — provisto por el usuario (mp3, ~14KB, 64kbps/24kHz).

### Hook `useNotificationSound`

Nuevo archivo `src/hooks/use-notification-sound.ts`. Encapsula un único elemento `<audio>` precargado vía `useRef` (evita crear una instancia nueva por reproducción) y expone una función estable `play()`:

- Antes de reproducir, resetea `audio.currentTime = 0` para que mensajes consecutivos siempre vuelvan a sonar desde el inicio, incluso si el sonido anterior no terminó.
- `audio.play()` se envuelve en `.catch(() => {})` para absorber silenciosamente el bloqueo de autoplay del navegador (no debe romper el flujo ni loguear error si el navegador lo bloquea).

### Punto de enganche

En `src/app/(dashboard)/inbox/page.tsx`, dentro de `handleMessageEvent` (rama `event.eventType === "INSERT"`, ~línea 209): cuando `newMsg.sender_type === 'customer'`, se llama a `play()`.

`sender_type` (`'customer' | 'agent' | 'bot'`, definido en `src/types/index.ts:208`) es el campo que distingue mensajes entrantes (`'customer'`, insertados por el webhook en `src/app/api/whatsapp/webhook/route.ts:678`) de salientes (`'agent'`/`'bot'`). Filtrar por `'customer'` garantiza que el propio agente enviando un mensaje, o una respuesta automática del bot, no disparen el sonido.

## Testing

- Verificación manual en navegador: enviar un mensaje de WhatsApp de prueba al número conectado y confirmar que suena en `/inbox`.
- Confirmar que enviar un mensaje **desde** el CRM (agente) no dispara el sonido.
- Confirmar que no hay errores en consola si el navegador bloquea el autoplay (simulable evitando interacción previa con la página).
