# Plan — nandogomez.com

Ciclo: recon → **plan** → ejecución → adversario. Las decisiones de stack, hosting, dominio, analítica y titular ya están cerradas y no se reabren aquí.

**Revisión 2** (2026-10-27). Corrige los 9 bloqueantes y las notas de la revisión adversaria. **Estado: BLOQUEADO.** Cualquier cambio de alcance requiere una revisión 3 explícita.

## Versiones y APIs comprobadas

**Versiones fijadas exactas.** Comprobadas en npm el 2026-10-27:

| Paquete | Versión | Nota |
|---|---|---|
| `astro` | 7.4.2 | engines: node ≥ 22.23.4 |
| `@astrojs/check` | 0.9.12 | peer: typescript ^5 \|\| ^6 |
| `typescript` | **6.0.3** | No la 7.x: `@astrojs/check` no la admite |
| `@astrojs/sitemap` | 3.7.4 | |
| `vitest` | 5.0.5 | Astro trae vite ^8.3.4, compatible |
| `@vitest/coverage-v8` | 5.0.5 | |
| `jsdom` | 30.1.3 | No implementa `HTMLDialogElement.showModal`, ver P7b |
| `@fontsource/geist` | 5.3.0 | Registra la familia `'Geist'`, igual que `tokens.json` |
| `@fontsource/geist-mono` | 5.3.0 | |
| `@playwright/test` | 1.64.1 | |
| `@axe-core/playwright` | 4.14.0 | |

**Node.** `.node-version` con **`24.22.1`** exacta. Es la última 24.x publicada. Astro exige ≥ 22.23.4.

**APIs leídas en docs.astro.build.**
- `import { Image, Picture } from 'astro:assets'`. `<Picture>` admite `formats`, `fallbackFormat`, `widths` + `sizes`, `quality` y `priority`. `alt` es obligatorio. El tamaño se deduce en las imágenes importadas desde `src/`. `fallbackFormat` sale en PNG por defecto con imágenes estáticas, así que hay que fijarlo.
- Sitemap: requiere `site`. Genera `sitemap-index.xml` y `sitemap-0.xml`. Tiene `filter(page)`.
- `security.csp` de Astro emite una CSP en `<meta>` con hashes. No se usa: la CSP va en `_headers` y el sitio no tiene nada en línea.

**Dudas de la revisión 1, resueltas por la prueba del adversario** (astro 7.4.2, `scratchpad/probe`):
1. Con `vite.build.assetsInlineLimit: 0` + `build.inlineStylesheets: 'never'`, **nada sale en línea**.
2. `build.format: 'file'` genera `dist/aviso-legal.html`, y el sitemap da `https://nandogomez.com/aviso-legal`.
3. `astro preview` sirve `/aviso-legal` y `/aviso-legal.html` con 200, y `/aviso-legal/` con 404. Queda pendiente comprobar el comportamiento en Cloudflare: paso manual M5.
4. **Hallazgo:** `Astro.url.pathname` incluye `.html` con `format: 'file'`, de modo que el canonical saldría `…/aviso-legal.html`. Se resuelve con `canonicalUrl()` (§3) y el test A3b.

---

## 1. Objetivo

Publicar nandogomez.com como sitio estático Astro, fiel a los diseños aprobados de `design/`: la home y tres páginas legales, más un aviso de cookies conforme a la guía de la AEPD.

Requisitos:
- Ningún recurso de terceros, salvo Google Analytics 4.
- GA4 solo se carga tras un consentimiento explícito.
- Cada cambio llega por un PR verde.
- Un comprobador impide publicar en producción con textos `[PENDIENTES]`.

## 2. Criterios de aceptación (globales)

«dist-test» = test de Vitest que parsea `dist/**/*.html` con jsdom, sin ejecutar scripts.

| # | Criterio | Verificación | Paso |
|---|---|---|---|
| A1 | `astro check` con 0 errores **y 0 avisos**: `"typecheck": "astro check --minimumFailingSeverity warning"` | CI, puerta dura | P0 |
| A2 | `npm run build` termina con 0 sin `PUBLIC_GA_ID`. Con `PUBLIC_GA_ID=G-TEST1234`, `#ng-consent[data-ga-id="G-TEST1234"]` existe en todas las páginas | CI + dist-test con build a directorio temporal | P7a |
| A3 | Existen `dist/{index,aviso-legal,privacidad,cookies,404}.html`. Todas tienen `<html lang="es">`, un solo `<h1>`, y `<title>` y `meta description` únicos | dist-test | P1–P3 |
| A3b | `link[rel=canonical]` y `og:url` valen **exactamente** `https://nandogomez.com/` (home), `…/aviso-legal`, `…/privacidad` y `…/cookies`: sin `.html`, sin `index` y sin barra final, salvo la raíz. Coinciden 1:1 con los `<loc>` de `sitemap-0.xml`. `404.html` no tiene canonical y está fuera del sitemap | dist-test | P1 (canonical), P10 (og:url + sitemap) |
| A4 | Ningún `.html` ni `.css` de `dist/` contiene `fonts.googleapis.com`, `fonts.gstatic.com`, `/_blob/`, `support.js`, `DCLogic`, `data-props`, `{{` ni `x-dc` | dist-test (solo HTML y CSS; los JS minificados pueden contener `{{`) | P1 |
| A5 | Ninguna página tiene `<script>` sin `src`, `<style>`, `style=` ni atributos `on*=` | dist-test | P1 |
| A6 | Ningún HTML referencia `googletagmanager.com` ni `google-analytics.com`. Antes de aceptar hay 0 peticiones a esos hosts; después de aceptar, ≥ 1 | dist-test (P1) + unidad (P6) + e2e (P11) | |
| A7 | Todo `href`/`src` interno de `dist/` (ruta o `#id`) resuelve | dist-test | P3 |
| A8 | El pie de **todas** las páginas tiene «Aviso legal», «Privacidad», «Cookies» y «Configurar cookies» (`[data-consent-open]`) | dist-test | P2a+ |
| A9 | Fuentes propias: hay ≥ 1 `@font-face` con `url(/_astro/…woff2)`, 0 URLs externas y 0 ficheros `.woff` en `dist/` | dist-test | P1 |
| A10 | Cada uno de los **24** tokens de `design/tokens.json` está en `src/styles/tokens.css` como `--nombre: valor`. No hay hex fuera de `tokens.css`, **salvo** `THEME_COLOR` en `src/lib/site.ts`, que un test exige igual al token `bg` | unidad | P1 |
| A11 | El retrato es `<picture>` con `source[type="image/avif"]` y un `<img>` webp con `width`, `height` y `alt`. Ningún derivado supera 120 KB y ninguno es PNG | dist-test | P8 |
| A12 | Cobertura de líneas ≥ 95 % en `src/lib/consent/**` (umbral solo ahí) | `vitest run --coverage`, `@vitest/coverage-v8` | P5 |
| A13 | 0 violaciones axe `serious`/`critical` (wcag2a/aa) en las 4 páginas, con el banner y con el panel | e2e | P11 |
| A14 | A 320 px, `scrollWidth ≤ 320` en las 4 páginas | e2e | P11 |
| A15 | El panel atrapa el foco, Escape lo cierra, el foco vuelve y el fondo queda inerte | e2e + unidad | P7b, P11 |
| A16 | `public/_headers` contiene la CSP exacta de §7 y el resto de cabeceras | unidad que parsea el fichero | P10 |
| A17 | `check:release --strict` sale con ≠ 0 si queda algún `[…]` pendiente en el texto visible o falta un GA ID válido, y con 0 si no | unidad con fixtures | P4 |
| A18 | Lighthouse móvil. **Preview de Cloudflare** (lleva `noindex`, así que SEO no aplica): Rendimiento ≥ 90, Accesibilidad ≥ 95, Buenas prácticas ≥ 95. **SEO ≥ 95**: en local con `npm run build && npx astro preview`, o en el dominio real tras M10 | manual; capturas en el PR de publicación | |

## 3. Arquitectura

```
astro.config.mjs   site:'https://nandogomez.com', trailingSlash:'never', build.format:'file',
                   build.inlineStylesheets:'never', vite.build.assetsInlineLimit:0, integrations:[sitemap()]
.node-version      24.22.1
.gitignore         node_modules dist dist-e2e .astro coverage test-results playwright-report
public/_headers  robots.txt  favicon.svg
src/
  assets/nando-retrato.webp     copia de design/ (900×900); design/ no se toca
  styles/tokens.css             24 tokens + familias + extensiones locales
  styles/global.css             reset, imports fontsource, tipografía, .visually-hidden, :focus-visible
  lib/site.ts                   SITE_URL, EMAIL, LINKEDIN, TWOFERS, AEPD, THEME_COLOR, canonicalUrl()
  lib/legal.ts                  LEGAL_UPDATED, REGISTRO_MERCANTIL (los pendientes, en un solo sitio)
  lib/ga.ts                     getGaId(): string|null
  lib/consent/core.ts           lógica pura de la cookie
  lib/consent/state.ts          reductor puro de la UI
  lib/consent/analytics.ts      carga y revocación de GA (document/window inyectados)
  scripts/consent-ui.ts         capa DOM fina
  components/ Header (home|legal) · Footer · SectionLabel · Button · ServiceCard · MethodStep ·
              Portrait · DefinitionRows (profile|legal) · CookieTable · ConsentManager
  layouts/ BaseLayout (head, canonical, skip link, ConsentManager) · LegalLayout
  pages/ index · aviso-legal · privacidad · cookies · 404
scripts/check-release.mjs
tests/unit/**  tests/dist/** (+ helpers.ts)  tests/fixtures/**
e2e/**         playwright.config.ts (P11)
```

**`canonicalUrl(pathname: string): string`** (pura, en `site.ts`). Quita `.html` final y `/index`, y quita la barra final salvo en la raíz. Devuelve `new URL(path, SITE_URL).href`. `BaseLayout` la usa con `Astro.url.pathname`, y `og:url` reutiliza el mismo valor. Una prop `canonical?: string | false` permite anularla; `404` pasa `false`. Tiene test unitario con `/`, `/index.html`, `/aviso-legal.html`, `/aviso-legal` y `/aviso-legal/`.

**Tokens → CSS.** `tokens.css` se escribe a mano, sin generador: son 24 valores estables (10 colores, 7 espacios, 5 radios y 2 tamaños), más 2 familias. `on-lime` → `var(--bg)`.

- Extensiones locales, marcadas como tales:
  - `--border-control: #3a3d44`
  - `--overlay: rgba(14,15,17,.72)`, para `::backdrop`
- Familias:
  - `--font-sans: "Geist", system-ui, sans-serif`
  - `--font-mono: "Geist Mono", ui-monospace, monospace`
- Solo subconjunto latin y solo woff2. En `global.css` van `@font-face` propios que apuntan a `@fontsource/geist/files/geist-latin-{400,500,600,700}-normal.woff2` y `@fontsource/geist-mono/files/geist-mono-latin-{400,500}-normal.woff2`, con `font-display: swap`. Así no se emite el `.woff` de respaldo, que sí traen los CSS de fontsource (A9).
- `THEME_COLOR = '#0e0f11'` vive en `site.ts`. El test A10 lo compara con `bg`.

**Consentimiento.** `core.ts`, `state.ts` y los comandos de `analytics.ts` son puros: reciben la cadena de cookies, el instante y los objetos DOM. `consent-ui.ts` (≤ 120 líneas) hace la lectura y escritura real y los efectos.

**Panel = `<dialog>` + `showModal()`.** Aporta la semántica modal, el fondo inerte, Escape (evento `cancel`) y la capa superior. El foco se guarda y se devuelve a mano.

**Sin JS.** El banner sale con `hidden`. «Configurar cookies» es `<a href="/cookies#configurar" data-consent-open>`.

## 4. Contratos

### 4.1 Cookie `ng_consent`
- **Valor:** `v<versión>.<granted|denied>.<savedAt>`, con `savedAt` en segundos epoch. Regex: `^v([1-9]\d{0,2})\.(granted|denied)\.(\d{10})$`. Ejemplo: `v1.granted.1767225600`.
- **Atributos:** `Path=/; Max-Age=31536000; SameSite=Lax; Secure`. Sin `Domain`. `Secure` se omite solo con `http:` en `localhost` o `127.0.0.1`.
- **Inválido, y por tanto se vuelve a preguntar:** el valor falta, no cumple la regex, la versión es menor que `CONSENT_VERSION`, `savedAt` está más de 1 día en el futuro, o `now − savedAt > 31536000`.
- `CONSENT_VERSION = 1`. Se sube cuando cambien las finalidades.

### 4.2 API
```ts
// core.ts
export const CONSENT_COOKIE = 'ng_consent', CONSENT_VERSION = 1, CONSENT_MAX_AGE_S = 31_536_000;
export type Consent = { version: number; analytics: boolean; savedAt: number };
parseConsent(cookieHeader: string, nowS: number): Consent | null
serializeConsent(analytics: boolean, nowS: number, opts: { secure: boolean }): string
needsPrompt(c: Consent | null): boolean
gaCookiesToClear(cookieHeader: string): string[]              // '_ga' y '_ga_*' presentes
expireCookieWrites(name: string, hostname: string): string[]
// Devuelve escrituras con Max-Age=0; Path=/ para: (1) sin Domain; (2) Domain=<hostname completo>;
// (3) Domain=.nandogomez.com solo si hostname === 'nandogomez.com' o termina en '.nandogomez.com'.
// No se calcula el «dominio registrable»: pages.dev está en la Public Suffix List
// y Domain=.pages.dev sería rechazado.

// state.ts
type View = 'hidden' | 'banner' | 'panel';
type UiState = { view: View; draft: boolean; saved: Consent | null };
type Action = { type: 'init'; saved: Consent | null } | { type: 'accept' } | { type: 'reject' }
            | { type: 'open' } | { type: 'toggle' } | { type: 'save' } | { type: 'escape' };
reduce(s: UiState, a: Action): UiState
// open: draft = saved?.analytics ?? false (elección actual precargada)
// escape en el panel → 'banner' si saved es null; si no, 'hidden'. escape en el banner → sin cambio

// analytics.ts + ga.ts
isValidGaId(id: string | undefined): id is string   // ^G-[A-Z0-9]{4,15}$
getGaId(): string | null                            // import.meta.env.PUBLIC_GA_ID, recortado y validado
gtagCommands(gaId: string): unknown[][]
loadAnalytics(gaId: string, doc: Document, win: Window): void   // idempotente
revokeAnalytics(gaId: string, doc: Document, win: Window): void
```

### 4.3 GA4 con Consent Mode v2 en modo básico
No hay ninguna etiqueta de Google en el HTML. Solo con `granted` y un ID válido:
1. Se inicializa `dataLayer`, y `gtag` empuja **el objeto `arguments`**. Un test lo verifica con `Object.prototype.toString`.
2. `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'})`
3. `gtag('js', new Date())` y `gtag('config', gaId, {allow_google_signals:false, allow_ad_personalization_signals:false})`
4. Se inyecta `<script async src="https://www.googletagmanager.com/gtag/js?id=…">`.

Al revocar: se activa `ga-disable-<id>`, se llama a `gtag('consent','update',{analytics_storage:'denied'})` y se borran las cookies con `expireCookieWrites`. No se recarga la página.

### 4.4 Eventos y atributos
- **Reabrir el panel:** clic en `[data-consent-open]` (delegado) o `document.dispatchEvent(new CustomEvent('ng:consent-open'))`.
- **Tras guardar:** se emite `CustomEvent('ng:consent-change', { detail: { analytics } })`.
- **ID de GA en el HTML:** `<div id="ng-consent" data-ga-id="G-…">`; el atributo se omite si no hay ID.
- **Anuncio accesible:** región `role="status"` oculta con «Preferencia guardada: analítica aceptada|rechazada». Sustituye al estado «done» del mock.

### 4.5 `check:release`
- **Qué busca:** recorre los nodos de texto visibles de `dist/**/*.html` (ignora `script` y `style`) con `/\[[^\]\n]{2,}\]/`. También exige un `PUBLIC_GA_ID` válido.
- **Salida:** con `--strict` termina con 1 si encuentra algo; sin `--strict`, avisa y termina con 0.
- **Scripts:**
  - `"check:release": "node scripts/check-release.mjs --strict"`
  - `"build": "astro build && node scripts/check-release.mjs"`. Es estricto si `RELEASE_STRICT=1`.
- **Dónde actúa:**
  - CI: informativo.
  - Cloudflare: `RELEASE_STRICT=1` **solo en Production**, que Nando activa en M9 antes de apuntar el dominio. Desde entonces, un build con pendientes falla y Cloudflare mantiene el despliegue anterior.

## 5. Casos límite

| Caso | Comportamiento |
|---|---|
| Sin JS | Banner oculto y nunca hay GA. El enlace lleva a `/cookies#configurar`, donde hay un `<noscript>` explicativo. |
| Cookies bloqueadas o `document.cookie` lanza excepción | Todo va en try/catch. Tras escribir, se relee: si no persiste, la elección vale para esta página y el banner vuelve en la siguiente navegación. No se muestra ningún error. |
| `PUBLIC_GA_ID` vacío o inválido | `getGaId()` devuelve `null`. El build avisa y no rompe. No hay `data-ga-id`. La UI funciona y no carga GA. La tabla muestra `_ga_[ID]`, así que `check:release` falla, que es lo correcto. |
| Consentimiento caducado, de versión vieja, malformado o con fecha futura | `null`: vuelve el banner y el panel arranca con la analítica desactivada. |
| Revocar tras aceptar | Se aplica §4.3 al revocar, sin recargar. |
| Teclado | Hay skip link. El banner va al principio del DOM y no roba el foco. El panel enfoca su título y devuelve el foco al disparador, o a `#main` si el disparador ya no está visible. El switch es `<button role="switch" aria-checked>`. La tabla va en una región con `tabindex=0`. `:focus-visible` con contorno de 2px en `--ink`. |
| `prefers-reduced-motion` | Transiciones y `scroll-behavior: smooth` solo bajo `(prefers-reduced-motion: no-preference)`. |
| 320 px | La nav se reparte en varias líneas. Los titulares mantienen sus `clamp()` con `overflow-wrap: anywhere`. El `dl` se apila. La tabla tiene scroll interno. Banner: `inset-inline: 16px; bottom: 16px; max-width: 560px`. Panel: `width: min(600px, 100% - 32px); max-height: calc(100dvh - 32px); overflow: auto`. |
| Rutas | La forma canónica es `/aviso-legal`. En local, `/aviso-legal/` da 404. En Cloudflare se comprueba en M5 con `curl -sI`, y si el comportamiento difiere se anota en el PR de P10. `404.html` lo sirve Cloudflare. |
| Previews `*.pages.dev` | `X-Robots-Tag: noindex`, y sin el GA ID real (M6). |

## 6. Plan de pruebas

- **Unidad** (`npm test` = `vitest run --coverage`):
  - `site` (con `canonicalUrl` y `THEME_COLOR`), `tokens`, `core`, `state`, `ga` y `analytics` (jsdom).
  - `headers`, `check-release` (fixtures) y `consent-ui` (jsdom con polyfill de `showModal`/`close`/`cancel` en `tests/setup/dialog.ts`).
  - La cobertura se mide con `coverage.include: ['src/lib/consent/**']` y `thresholds: { lines: 95 }`.
- **dist** (`npm run test:dist`, tras el build): jsdom sin `runScripts`. Cubre A2–A11, A3b y el sitemap. Para A2, el test lanza `astro build --outDir <tmp>` con `PUBLIC_GA_ID=G-TEST1234`.
- **E2E** (P11; solo Chromium y solo en GitHub Actions, unos 60–90 s). Se justifica porque A6, A13, A14 y A15 son exigencias legales o de accesibilidad que jsdom no puede demostrar: red real, `inert`, foco y layout. `playwright.config.ts` hace **su propio build**, independiente de `vars.PUBLIC_GA_ID`:
  ```ts
  webServer: {
    command: 'PUBLIC_GA_ID=G-TEST1234 npx astro build --outDir dist-e2e && npx astro preview --outDir dist-e2e --port 4321',
    url: 'http://localhost:4321/', reuseExistingServer: !process.env.CI, timeout: 120_000,
  }
  ```
  Las peticiones a `*.googletagmanager.com` y `*.google-analytics.com` se interceptan con `page.route`: se responde 204 y se cuentan. La CSP de `_headers` se inyecta como cabecera y el test falla ante cualquier `securitypolicyviolation`.

  Escenarios:
  1. 0 peticiones a Google antes de elegir y tras rechazar.
  2. Al aceptar, ≥ 1 petición.
  3. Tras recargar, sin banner y con GA.
  4. «Configurar cookies» en las 4 páginas abre el panel con la elección precargada.
  5. Tab, Escape y retorno del foco.
  6. axe en 4 páginas × {banner, panel}.
  7. 320 px.
- **Manual:** Lighthouse (A18) y la comprobación desde fuera (M11).

## 7. Riesgos y seguridad

`public/_headers`:
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://*.googletagmanager.com; style-src 'self'; img-src 'self' https://*.google-analytics.com https://*.googletagmanager.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
  Cross-Origin-Opener-Policy: same-origin
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
https://:project.pages.dev/*
  X-Robots-Tag: noindex
https://:version.:project.pages.dev/*
  X-Robots-Tag: noindex
```

| Riesgo | Mitigación |
|---|---|
| Algo sale en línea y la CSP lo bloquea solo en producción | La prueba del adversario confirma que la configuración no genera nada en línea. A5 vigila cualquier regresión. El e2e aplica la CSP real. |
| GA usa subdominios regionales | Comodines `*.google-analytics.com`, `*.analytics.google.com` y `*.googletagmanager.com`. |
| HSTS sin `includeSubDomains` | Deliberado mientras no se conozcan los subdominios. |
| Enlaces externos | No se usa `target=_blank`. Si se añade, con `rel="noopener noreferrer"` (dist-test). |
| Datos reales de previews en GA | El GA ID real **no** se define en el entorno Preview de Cloudflare (M6). |
| Privacidad | Sin GA antes de consentir. Señales de Google y personalización de anuncios desactivadas. Al revocar se borran las cookies `_ga*` con el hostname completo y `.nandogomez.com`. Fuentes e imagen propias. |
| Cadena de suministro | Versiones exactas y `npm ci`. `npm audit --omit=dev` antes de publicar. |
| Node en Cloudflare | `.node-version` = `24.22.1`. El log del primer build debe mostrarlo. |

## 8. Pasos

Reglas de todos los pasos:
- Rama `feat/web-pN` y un PR por paso.
- Tests en ROJO primero.
- CI verde. El CI existe desde P0 (M2).
- Diff de 300 líneas o menos, sin contar `package-lock.json` ni binarios.
- Ningún paso deja `main` rojo.

**Paso previo (agente, cuando se autorice el push).** Hoy `main` no tiene commits, el remoto `samdaad/nandogomez-web` existe vacío y `origin` ya está configurado. Para que `main` sea la rama por defecto, se empuja primero:
```
git switch --orphan main && git commit --allow-empty -m "chore: init" && git push -u origin main
git switch feat/web-inicial && git rebase --root --onto main && git push -u origin feat/web-inicial
gh pr create --base main --head feat/web-inicial --title "docs: plan de la web y diseños de referencia"
```
`git switch --orphan` vacía el índice y el árbol de trabajo, así que el commit raíz sale vacío. Los ficheros vuelven al cambiar a `feat/web-inicial`. P0 sale de `main` cuando Nando mergea este PR.

---

**P0. Bootstrap** (`feat/web-p0`)
- **Entra:**
  - `package.json` con versiones exactas (astro, @astrojs/check, typescript, vitest) y scripts: `dev`, `build`, `preview`, `typecheck` (`astro check --minimumFailingSeverity warning`), `test` (`vitest run`).
  - `astro.config.mjs` (§3, sin sitemap), `tsconfig.json` (`astro/tsconfigs/strictest`), `.node-version`, `.gitignore`, `vitest.config.ts`.
  - `src/lib/site.ts` (`SITE_URL`, `EMAIL`), un `index.astro` mínimo y `docs/ci.yml.txt`.
- **ROJO:** `site.test.ts` (`SITE_URL`, `EMAIL`).
- **Manual:** en cuanto el agente empuja la rama, Nando hace M2, que añade `ci.yml` **en esta misma rama**. El agente hace `git pull` antes de cualquier commit posterior en `feat/web-p0`.
- **Acepta:** el PR muestra el check de CI en verde (typecheck, test, build) y existe `dist/index.html`.

**P1. Tokens, fuentes, BaseLayout, canonical y arnés de dist** (`feat/web-p1`)
- **Entra:** `tokens.css`, `global.css` con `@font-face` woff2 propios (`@fontsource/geist` y `@fontsource/geist-mono`), `THEME_COLOR` y `canonicalUrl()` en `site.ts`, `BaseLayout`, `vitest.dist.config.ts`, `tests/dist/helpers.ts` y el script `test:dist`.
- **ROJO:**
  - `tokens.test.ts` (A10, incluida la excepción `THEME_COLOR`).
  - `site.test.ts` (casos de `canonicalUrl`).
  - `dist/base.test.ts` (A4, A5, A6-HTML, A9, `lang`, canonical de la home = `https://nandogomez.com/`).
- **Acepta:** todo en verde.

**P2a. Componentes legales y `/aviso-legal`** (`feat/web-p2a`)
- **Entra:** `Header` legal, `Footer` (único, con «Configurar cookies»), `SectionLabel`, `DefinitionRows`, `LegalLayout`, `lib/legal.ts` y la página, con el teléfono como `tel:+34603242682`.
- **ROJO:** `dist/aviso-legal.test.ts` (7 `h2`, 7 pares `dt/dd`, A8, canonical `https://nandogomez.com/aviso-legal`).
- **Acepta:** verde.

**P2b. `/privacidad`** (`feat/web-p2b`)
- **Entra:** la página, con el texto de §10.1.
- **ROJO:** `dist/privacidad.test.ts` (6 `h2`, bloques A y B con 4 filas cada uno, la frase de §10.1, A8, canonical).
- **Acepta:** verde.

**P3. `/cookies`, 404 y enlaces** (`feat/web-p3`)
- **Entra:** `CookieTable` (`_ga_<ID sin "G-">` o `_ga_[ID]`), la página con `#configurar`, `<noscript>` y el texto de §10.1, y `404.astro` (`canonical={false}`).
- **ROJO:** `dist/cookies.test.ts` (4 `h2`, 3 filas, región con `tabindex=0`); `dist/links.test.ts` (A7); A3 completo.
- **Acepta:** verde.

**P4. `check:release`** (`feat/web-p4`)
- **Entra:** el script, la cadena de `build`, `check:release` y las fixtures.
- **ROJO:** `check-release.test.ts` (A17; ignora corchetes en `script`/`style`; el modo aviso termina con 0).
- **Acepta:** verde. Sobre el `dist/` real lista los 5 pendientes (3 fechas, el Registro y `_ga_[ID]`).

**P5. Núcleo de consentimiento** (`feat/web-p5`)
- **Entra:** `core.ts`, `state.ts`, `@vitest/coverage-v8` 5.0.5, y la cobertura en `vitest.config.ts` (solo `src/lib/consent/**`, líneas ≥ 95). `test` pasa a `vitest run --coverage`.
- **ROJO:** `core.test.ts` (§4.1; `expireCookieWrites` con `nandogomez.com`, `www.nandogomez.com`, `x.pages.dev` → nunca `Domain=.pages.dev`, y `localhost`); `state.test.ts` (tabla completa de transiciones).
- **Acepta:** verde y A12.

**P6. Analítica** (`feat/web-p6`)
- **Entra:** `ga.ts` y `analytics.ts`.
- **ROJO:** `analytics.test.ts` (nada antes de cargar; secuencia exacta de §4.3; `Arguments`; idempotencia; revocación); `ga.test.ts`.
- **Acepta:** verde y A12.

**P7a. Marcado y CSS de banner y panel** (`feat/web-p7a`)
- **Entra:** `ConsentManager.astro`, sin script. Contiene:
  - el banner `hidden`, con «Rechazar» y «Aceptar» con la misma clase, y «Configurar»;
  - el `<dialog>` con el switch, «Rechazar todo», «Aceptar todo» y «Guardar selección» en lima;
  - la región `status` y `#ng-consent` con `data-ga-id` opcional.
  
  Se monta en `BaseLayout`.
- **ROJO:** `dist/consent-markup.test.ts`:
  - el banner es `hidden` en las 5 páginas;
  - los botones del banner tienen idéntica `className`;
  - el `dialog` tiene `aria-labelledby` válido y el switch `role=switch` con `aria-checked="false"`;
  - A2: sin ID no hay `data-ga-id`; con `G-TEST1234` en un build temporal, sí.
- **Acepta:** verde y A5 sigue en verde.

**P7b. Comportamiento de consentimiento** (`feat/web-p7b`)
- **Entra:** `scripts/consent-ui.ts` (`<script>` de Astro en `ConsentManager`, empaquetado como fichero externo) y `tests/setup/dialog.ts` (polyfill de test).
- **ROJO:** `consent-ui.test.ts` (jsdom, con el HTML de `dist/index.html` como fixture):
  - sin cookie se muestra el banner; con una cookie válida, no;
  - `[data-consent-open]` abre el panel con la elección precargada;
  - Escape sin elección guardada vuelve al banner;
  - el foco vuelve al disparador;
  - «Aceptar» escribe una cookie con el formato de §4.1 y llama a `loadAnalytics` solo si hay `data-ga-id`;
  - se emite `ng:consent-change`.
- **Acepta:** verde y prueba manual en la preview.

**P8. Home I: cabecera, hero, retrato y servicios** (`feat/web-p8`)
- **Entra:** `Header` home (con «Contactar» secundario, §10.2), `Button`, `ServiceCard`, `Portrait` y las secciones `#inicio` y `#servicios`. La etiqueta «/ servicios» va como `h2`.

  El retrato:
  ```
  <Picture src={retrato} formats={['avif']} fallbackFormat="webp" quality={70}
           widths={[360, 560, 800]} sizes="(min-width: 1024px) 400px, calc(100vw - 48px)" priority />
  ```
  El original de 900×900 pesa 130 KB. Con `quality` 70 y un máximo de 800 px, todos los derivados deben quedar por debajo de 120 KB. Si alguno no, se baja la calidad: lo decide el test, no el criterio de nadie.
- **ROJO:** `dist/home.test.ts` (A11; 3 `article` con `h3`; existen `#inicio` y `#servicios`; como máximo un `.btn--primary` por `section` o `header`).
- **Acepta:** verde.

**P9. Home II: método, sobre mí, Digital Twofers y contacto** (`feat/web-p9`)
- **Entra:** `MethodStep` y las secciones `#metodo`, `#sobre-mi`, `#twofers` y `#contacto`. El `Footer` ya existe desde P2a.
- **ROJO:** se amplía `dist/home.test.ts` (4 pasos; 6 anclas; exactamente 4 destinos externos permitidos; A7 y A8).
- **Acepta:** verde, con capturas en el PR comparando con `design/Tecnico.dc.html` en escritorio y a 320 px.

**P10. Cabeceras y SEO** (`feat/web-p10`)
- **Entra:** `_headers`, `@astrojs/sitemap` 3.7.4, `robots.txt`, `favicon.svg`, OG (`og:url` = canonical; `og:image` absoluto con el retrato de 800 px; `og:locale` `es_ES`) y `meta theme-color` con `THEME_COLOR`.
- **ROJO:** `headers.test.ts` (A16; sin `unsafe-inline`/`unsafe-eval`); `dist/seo.test.ts` (A3b completo: canonical = `og:url` = `<loc>`, 4 URLs sin `.html` ni barra final, 404 excluida; `robots.txt`).
- **Acepta:** verde.

**P11. E2E y accesibilidad** (`feat/web-p11`)
- **Entra:** `@playwright/test`, `@axe-core/playwright`, `playwright.config.ts` con el `webServer` de §6, `e2e/*.spec.ts` y el script `test:e2e`. El CI lo ejecuta automáticamente (`hashFiles`).
- **ROJO:** las specs se escriben antes de cualquier ajuste.
- **Acepta:** A6, A13, A14 y A15 en verde en GitHub Actions.

**Dependencias:**
- P0 → P1 → P2a → P2b → P3 → P4.
- P0 → P5 → P6.
- P7a necesita P1. P7b necesita P6 y P7a.
- P8 y P9 necesitan P2a y P7b. P10 necesita P9. P11 necesita P10.
- P5 y P6 pueden ir en paralelo con P2a–P4.

## 9. Pasos manuales de Nando (en orden)

- **M1. Mergear el PR de `feat/web-inicial`.** Lo abre el agente en el paso previo. El repo ya existe y no hay que crearlo.
- **M2. Crear el CI en la rama de P0.** Cuando el agente avise de que `feat/web-p0` está empujada:
  1. En GitHub web, cambia el selector de ramas a **`feat/web-p0`**.
  2. *Add file → Create new file* → `.github/workflows/ci.yml`.
  3. Pega `docs/ci.yml.txt` y haz commit **en esa rama**. No en `main`.

  Así el PR de P0 ya ejecuta el CI y `main` nunca queda sin él.
- **M3. Zona en Cloudflare.** Si `nandogomez.com` no está aún en Cloudflare: *Add a domain*, cambia los nameservers en el registrador y espera a que la zona quede «Active». Es requisito de M8 y M10.
- **M4. Cloudflare Pages.** *Workers & Pages → Create → Pages → Connect to Git* → `samdaad/nandogomez-web`. Preset Astro, `npm run build`, salida `dist`, rama de producción `main`. Comprueba en el log que usa Node 24.22.1.
- **M5. Rutas con barra final.** En la primera preview, ejecuta `curl -sI https://<preview>.pages.dev/aviso-legal/` y `…/aviso-legal.html`, y pega el resultado en el PR en curso.
- **M6. Propiedad GA4.**
  1. Crea la propiedad con un flujo web `https://nandogomez.com`.
  2. *Administrar → Recogida y conservación de datos → Conservación de datos* = **14 meses**. El valor por defecto son 2.
  3. Desactiva las señales de Google y la personalización de anuncios.
  4. Define `PUBLIC_GA_ID=G-…` en Cloudflare **solo en Production**. Preview queda sin ID para no contaminar los datos.
  5. Opcional: crea la *Repository variable* `PUBLIC_GA_ID` en GitHub, solo para que el aviso de CI salga en verde.
- **M7. Pendientes legales.** Rellena en `src/lib/legal.ts` la fecha y los datos del Registro Mercantil, en un PR de contenido. Antes, verifica el texto de §10.1 contra la ayuda oficial de Google sobre conservación de datos de GA4.
- **M8. Email Routing.** Necesita M3. *Email → Email Routing*: `hola@nandogomez.com` → tu Gmail. Verifica el destino y acepta los MX y el SPF.
- **M9. Antes de apuntar el dominio.**
  1. Define `RELEASE_STRICT=1` solo en Production y haz un redeploy, que debe pasar.
  2. Mide Lighthouse en la preview (Rendimiento, Accesibilidad y Buenas prácticas) y en local (SEO).
- **M10. Dominio.**
  1. En Pages, *Custom domains*: añade `nandogomez.com`.
  2. Crea el registro DNS `www` (CNAME a `nandogomez.com`) **con proxy activado (nube naranja)**.
  3. Añade una *Redirect Rule* `www.nandogomez.com/*` → `https://nandogomez.com/${1}` con 301.
  4. Mide SEO de Lighthouse en el dominio real.
- **M11. Comprobación desde fuera.**
  - `curl -sI https://nandogomez.com | grep -iE 'content-security|strict-transport'`.
  - Comprueba que `curl -sI https://www.nandogomez.com` devuelve 301.
  - En una ventana privada, confirma que no hay peticiones a Google hasta aceptar.
  - Envía un correo de prueba a hola@.
- **M12. Opcional: protección de rama.** *Settings → Branches*: exige el check **con el nombre exacto que GitHub muestra** tras la primera ejecución, presumiblemente `verify`.

### 9.1 Contenido exacto de `docs/ci.yml.txt`
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      PUBLIC_GA_ID: ${{ vars.PUBLIC_GA_ID }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Tests de unidad
        run: npm test
      - name: Build
        run: npm run build
      - name: Tests sobre dist
        run: npm run --if-present test:dist
      - name: E2E (Playwright)
        if: hashFiles('playwright.config.ts') != ''
        run: |
          npx playwright install --with-deps chromium
          npm run test:e2e
      - name: Lint (informativo)
        continue-on-error: true
        run: npm run --if-present lint
      - name: Pendientes de publicación (informativo)
        continue-on-error: true
        run: npm run --if-present check:release
```
**Puerta dura:** typecheck, unidad, build, dist y e2e. **Informativos:** lint y `check:release`.

El e2e no depende de `vars.PUBLIC_GA_ID`: Playwright hace su propio build con `G-TEST1234` en `dist-e2e/`. Con `--if-present` y `hashFiles`, este fichero no necesita más cambios.

## 10. Incoherencias de contenido: correcciones propuestas (las aprueba Nando)

**10.1. «14 meses» frente a «2 años».** Son cosas distintas: la conservación de los datos en Google y la vida de la cookie en el navegador. La redacción es prudente porque la conservación de GA4 se aplica a los datos de usuario y de evento, no a los informes agregados. Se verifica con la ayuda oficial de Google antes de publicar (M7).
- *Privacidad, bloque B, «Conservación»:* «Hemos configurado Google Analytics para conservar los datos asociados a usuarios y eventos durante 14 meses; después dejan de estar disponibles para su análisis detallado. Los informes con cifras agregadas, que no identifican a nadie, pueden mantenerse más tiempo. Este plazo es distinto de la duración de las cookies en tu navegador (hasta 2 años), que se detalla en la política de cookies.»
- *Cookies, tras la tabla:* «La duración indica cuánto permanece cada cookie en tu navegador si no la borras antes. El plazo de conservación de los datos en Google Analytics es otro y se explica en la política de privacidad. Si retiras tu consentimiento, borramos las cookies _ga de tu navegador.»
- *Columna «Duración» de `_ga` y `_ga_…`:* «2 años (en tu navegador)».

**10.2. Dos botones lima en la home.** «Contactar» de la cabecera pasa a ser **secundario**: borde `--border-strong`, texto `--ink` y radio `--radius-sm`. Siguen en lima:
- «Agenda una llamada» (hero) y «Escríbeme» (contacto): nunca coinciden en pantalla.
- «Guardar selección» del panel: el banner se oculta mientras el panel está abierto.

**Otras observaciones (no bloquean):**
- «Agenda una llamada» lleva a `#contacto`, donde solo hay correo y LinkedIn. Hay dos opciones: cambiar el texto a «Hablemos», o añadir un enlace de agenda. Esto último implicaría un tercero más en la CSP y en la privacidad.
- Confirmar que OK Humedades, RG Compact y DEOR Consultores aceptan aparecer con su nombre.
- Incorporar `--border-control` y `--overlay` a `tokens.json`.
- El pie de Aviso legal y de Privacidad no tenía «Configurar cookies»; se unifica (A8).
