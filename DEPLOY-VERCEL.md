# Despliegue en Vercel

Guía de despliegue de **WACRM** (Next.js 16 + Supabase) en Vercel usando el CLI.

> Requisitos: Node.js >= 20 y el CLI de Vercel instalado (`npm i -g vercel`).
> Verifica la versión con `vercel --version`.

---

## Flujo recomendado (primera vez)

```bash
vercel login           # autenticar el CLI (si no lo has hecho)
vercel link            # enlazar esta carpeta con un proyecto de Vercel
vercel                 # deploy de PREVIEW (entorno de prueba)
vercel --prod          # deploy a PRODUCCIÓN
```

La primera vez que ejecutes `vercel` te preguntará el scope/equipo, si crear un
proyecto nuevo, etc., y creará la carpeta `.vercel` (no la subas al repo, ya está
ignorada por Vercel).

---

## Comandos del día a día

| Comando | Para qué sirve |
| --- | --- |
| `vercel` | Despliegue de **preview** (cada cambio) |
| `vercel --prod` | Despliegue a **producción** |
| `vercel build` | Compila localmente sin subir |
| `vercel deploy --prebuilt` | Sube lo ya compilado por `vercel build` |
| `vercel ls` | Lista despliegues recientes |
| `vercel logs <url>` | Ver logs de un despliegue |
| `vercel inspect <url>` | Detalles de un despliegue |
| `vercel rollback` | Volver a un despliegue anterior |

---

## Variables de entorno (Supabase)

Este proyecto necesita las claves de Supabase. Gestiónalas con:

```bash
vercel env ls                              # listar
vercel env add NEXT_PUBLIC_SUPABASE_URL    # añadir (te pide el valor y el entorno)
vercel env pull .env.local                 # traer las vars a tu local
```

Variables habituales del proyecto:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor — nunca con prefijo `NEXT_PUBLIC_`)

> Define cada variable para los entornos que correspondan: **Production**,
> **Preview** y **Development**.

---

## Alternativa: despliegue por Git (sin CLI)

Como el repo está en GitHub, lo más cómodo suele ser conectar el repo en el
**dashboard de Vercel** una sola vez. A partir de ahí:

- Cada push a una rama crea un despliegue de **preview**.
- El merge a `main` despliega a **producción** automáticamente.

---

## Nota sobre ramas

El CLI **no** respeta la rama de Git como sí lo hace la integración con GitHub.
Si ejecutas `vercel --prod` desde cualquier rama, el despliegue irá a producción.
Para que cada rama genere su propio preview automáticamente, usa la integración
con GitHub.