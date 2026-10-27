# Plan — nandogomez.com

Ciclo: recon → **plan** → ejecución → adversario. Este documento es el plan. Las decisiones de stack, hosting, dominio, analítica y titular ya están cerradas y no se reabren aquí.

Versiones comprobadas en npm el 2026-10-27: `astro` 7.4.2 (engines: node ≥ 22.23.4), `@astrojs/check` 0.9.12 (peer: typescript ^5 || ^6), `@astrojs/sitemap` 3.7.4, `vitest` 5.0.5 (peer: vite ^6.4 || ^7 || ^8; Astro trae vite ^8.3.4), `jsdom` 30.1.3, `@fontsource/geist-sans` 5.3.0, `@fontsource/geist-mono` 5.3.0, `@playwright/test` 1.64.1, `@axe-core/playwright` 4.14.0, `typescript` **6.0.3** (no la 7.x: `@astrojs/check` no la admite).

APIs comprobadas en la documentación oficial (docs.astro.build):
- `import { Image, Picture } from 'astro:assets'`. `<Picture>` admite `formats`, `fallbackFormat`, `widths` + `sizes`, `priority`; `alt` es obligatorio; ancho y alto se deducen en imágenes importadas desde `src/`. Formato por defecto: webp. `fallbackFormat` por defecto es PNG en imágenes estáticas, así que **hay que fijarlo**.
- Sitemap: `npx astro add sitemap` o `npm i @astrojs/sitemap`; `site` es obligatorio; genera `sitemap-index.xml` y `sitemap-0.xml`; tiene opción `filter(page)`.
- `security.csp` de Astro (desde la 6.0) emite una **meta** CSP con hashes. No sirve para `frame-ancestors` ni para informes. Aquí la CSP va en la cabecera `_headers` (está decidido) y se diseña para no necesitar hashes: nada en línea.
- Cloudflare Pages: la versión de Node se fija con `.node-version` / `.nvmrc` o con `NODE_VERSION`. La imagen por defecto trae Node 18, que **no basta** para Astro 7.4.2.

Lo que **no** he podido leer en la documentación y debe comprobarse en P0 (con un test, no de memoria):
1. Si Astro mete en línea los scripts o estilos pequeños. La mitigación es `build.inlineStylesheets: 'never'` + `vite.build.assetsInlineLimit: 0`, y un test sobre `dist/` lo vigila.
2. Si `trailingSlash: 'never'` + `build.format: 'file'` producen `dist/aviso-legal.html` y un sitemap sin barra final (lo vigila un test).
3. Si `astro preview` sirve `/aviso-legal` con `build.format: 'file'` (hace falta para Playwright en P11).

---

## 1. Objetivo

Publicar nandogomez.com como sitio estático Astro, fiel a los diseños aprobados de `design/`: home y tres páginas legales, con un aviso de cookies conforme a la guía de la AEPD. La web no carga ningún recurso de terceros salvo Google Analytics 4, y GA4 solo se carga tras un consentimiento explícito. Cada cambio llega por un PR verde. Un comprobador impide que la web salga a producción con textos `[PENDIENTES]`.

## 2. Criterios de aceptación (globales)

Cada uno lleva la forma de verificarlo. «dist-test» es un test de Vitest que parsea `dist/**/*.html` con jsdom (un parser HTML real, sin ejecutar scripts).

| # | Criterio | Verificación |
|---|---|---|
| A1 | `npm run typecheck` (`astro check`) devuelve 0 errores y 0 avisos | CI, puerta dura |
| A2 | `npm run build` termina con código 0 sin `PUBLIC_GA_ID` y con un ID válido | CI (sin ID) + test en P6 (con ID) |
| A3 | Existen `dist/index.html`, `dist/aviso-legal.html`, `dist/privacidad.html`, `dist/cookies.html` y `dist/404.html`, todas con `<html lang="es">`, un solo `<h1>`, `<title>` y `<meta name="description">` únicos | dist-test |
| A4 | Ningún fichero de `dist/` contiene `fonts.googleapis.com`, `fonts.gstatic.com`, `/_blob/`, `support.js`, `DCLogic`, `data-props`, `{{` ni `x-dc` | dist-test (búsqueda en todos los ficheros de texto) |
| A5 | Ninguna página tiene un `<script>` sin `src`, un `<style>`, un atributo `style=` ni atributos `on*=`. Es lo que permite una CSP sin `'unsafe-inline'` | dist-test |
| A6 | Ningún HTML de `dist/` referencia `googletagmanager.com` ni `google-analytics.com`. GA solo lo inyecta el JS tras consentimiento | dist-test + unidad (P6) + e2e: 0 peticiones a `*.googletagmanager.com` / `*.google-analytics.com` antes de aceptar, y ≥ 1 después |
| A7 | Todo `href` y `src` interno de `dist/` (rutas y anclas `#id`) resuelve a un fichero o a un `id` existente | dist-test (link checker) |
| A8 | Todas las páginas tienen en el pie «Aviso legal», «Privacidad», «Cookies» y «Configurar cookies» (`[data-consent-open]`) | dist-test |
| A9 | Las tipografías se sirven desde `/_astro/*.woff2` propias: hay ≥ 1 `@font-face` con `url(/_astro/…woff2)` y ninguno externo | dist-test sobre el CSS |
| A10 | Cada token de color, espacio, radio y tamaño de `design/tokens.json` existe como `--<nombre>: <valor>` en `src/styles/tokens.css`, y no hay colores hex fuera de `tokens.css` en `src/**` | test de unidad |
| A11 | El retrato se sirve como `<picture>` con `<source type="image/avif">` y un `<img>` webp con `width`, `height` y `alt` no vacío. Ningún derivado supera 120 KB y ninguno es PNG | dist-test |
| A12 | La lógica de consentimiento (`src/lib/consent/*`) tiene una cobertura de líneas ≥ 95 % | `vitest --coverage` (v8) en el proyecto de unidad |
| A13 | Hay 0 violaciones axe `serious`/`critical` (wcag2a, wcag2aa) en las 4 páginas, con el banner visible y con el panel abierto | e2e (P11) |
| A14 | A 320 px de ancho, `document.documentElement.scrollWidth ≤ 320` en las 4 páginas | e2e (P11) |
| A15 | Desde el teclado: el panel atrapa el foco, Escape lo cierra, el foco vuelve al disparador y el fondo es inerte | e2e (P11) + unidad del reductor |
| A16 | `public/_headers` contiene la CSP exacta de §7, HSTS, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options y `noindex` para `*.pages.dev` | test de unidad que parsea `_headers` |
| A17 | `npm run check:release` falla (código ≠ 0) si en el texto visible de `dist/` queda algún `[…]` de pendientes, o si falta un `PUBLIC_GA_ID` válido. Pasa cuando no queda ninguno | test de unidad del script con fixtures |
| A18 | Lighthouse (móvil, sobre la preview de Cloudflare): Accesibilidad ≥ 95, Buenas prácticas ≥ 95, SEO ≥ 95 y Rendimiento ≥ 90 | manual, una vez antes de apuntar el dominio, con captura en el PR de publicación. No se automatiza: Lighthouse CI añade coste y ruido para 4 páginas |

## 3. Arquitectura

```
astro.config.mjs        site, trailingSlash:'never', build.format:'file',
                        build.inlineStylesheets:'never', vite.build.assetsInlineLimit:0,
                        integrations:[sitemap()]
.node-version           24  (Astro 7.4.2 exige ≥22.23.4; Cloudflare trae 18 por defecto)
public/
  _headers              cabeceras Cloudflare Pages (§7)
  robots.txt            Sitemap: https://nandogomez.com/sitemap-index.xml
  favicon.svg           monograma NG
src/
  assets/nando-retrato.webp      copia de design/ (900×900); design/ no se toca
  styles/tokens.css              custom properties (copia controlada de tokens.json)
  styles/global.css              reset, @font-face vía fontsource, clases tipográficas, .visually-hidden
  lib/site.ts                    SITE_URL, EMAIL, LINKEDIN, TWOFERS, AEPD, COPYRIGHT_YEAR
  lib/legal.ts                   LEGAL_UPDATED, REGISTRO_MERCANTIL (los únicos pendientes, en un solo sitio)
  lib/ga.ts                      getGaId(): string|null  (lee y valida import.meta.env.PUBLIC_GA_ID)
  lib/consent/core.ts            lógica pura: parse/serialize/needsPrompt/expiración
  lib/consent/state.ts           reductor puro de la UI (vistas y acciones)
  lib/consent/analytics.ts       carga y revocación de GA (depende de document/window inyectados)
  scripts/consent-ui.ts          capa DOM fina: eventos → reductor → DOM
  components/
    Header.astro                 variant: 'home' (nav con anclas) | 'legal' («← Volver a la web»)
    Footer.astro                 pie único (©, correo · Barcelona, legales, Configurar cookies)
    SectionLabel.astro           «/ servicios»; prop as: 'p' | 'h2'
    Button.astro                 <a> con variant 'primary' (lima) | 'secondary' (borde)
    ServiceCard.astro            icono (slot SVG), título h3, texto
    MethodStep.astro             «01 — Escuchar» + texto
    Portrait.astro               <Picture> con doble anillo y figcaption
    DefinitionRows.astro         <dl> filas; variant 'profile' | 'legal' (las 3 variantes fusionadas)
    CookieTable.astro            tabla en un contenedor role=region tabindex=0 con overflow-x
    ConsentManager.astro         banner + <dialog> panel + live region + <script> consent-ui
  layouts/
    BaseLayout.astro             <html lang=es>, head (title, description, canonical, OG), skip link,
                                 <ConsentManager/>, slot
    LegalLayout.astro            BaseLayout + Header legal + <main> 760px + Footer
  pages/ index.astro, aviso-legal.astro, privacidad.astro, cookies.astro, 404.astro
scripts/check-release.mjs        comprobador de pendientes (§4.4)
tests/
  unit/**.test.ts                Vitest (node; jsdom por fichero donde haga falta DOM)
  dist/**.test.ts                Vitest sobre dist/ (vitest.dist.config.ts)
  dist/helpers.ts                carga todos los HTML de dist con JSDOM (sin ejecutar scripts)
e2e/**.spec.ts                   Playwright (solo GitHub Actions, P11)
docs/ci.yml.txt                  contenido exacto de .github/workflows/ci.yml (lo pega Nando)
```

**Tokens → CSS.** `tokens.css` se escribe a mano: 10 colores, 7 espacios, 5 radios, 2 tamaños y las familias tipográficas. No uso un generador porque son 25 valores estables y un script de build añade más superficie que ahorro. La copia se mantiene fiel con un test (A10) que lee `design/tokens.json` y exige cada `--nombre: valor`. `on-lime` resuelve `{bg}` a `var(--bg)`. Los dos valores que están en el diseño pero fuera del sistema se declaran aparte, marcados como extensión local: `--border-control: #3a3d44` (borde de los botones del banner, del enlace de twofers y del switch apagado) y `--overlay: rgba(14,15,17,.72)` (fondo del panel, `::backdrop`). Hay que proponer a Nando que los incorpore a `tokens.json`. Familias: `--font-sans: "Geist Sans", "Geist", system-ui, sans-serif`. Fontsource registra la fuente como «Geist Sans», no como «Geist». `--font-mono: "Geist Mono", ui-monospace, monospace`. Solo se cargan los subconjuntos latin: `@fontsource/geist-sans/latin-{400,500,600,700}.css` y `@fontsource/geist-mono/latin-{400,500}.css`. Las flechas ← → ↗ caen a la fuente del sistema, lo que es aceptable y además ya ocurre con Google Fonts.

**Consentimiento: lógica pura y capa DOM fina.** `core.ts`, `state.ts` y la parte de comandos de `analytics.ts` no tocan `document` ni `window` directamente: reciben como argumentos la cadena de cookies, el instante y los objetos DOM. `consent-ui.ts` tiene menos de 120 líneas: lee `document.cookie`, llama al reductor, pinta la vista y aplica efectos (escribir la cookie, cargar o revocar GA, mover el foco).

**Panel = `<dialog>` nativo con `showModal()`.** Da la semántica de diálogo modal, fondo inerte, Escape (evento `cancel`) y capa superior sin código propio de trampa de foco. Aun así se guarda `document.activeElement` antes de abrir y se le devuelve el foco al cerrar, porque no todos los navegadores lo restauran. Si jsdom no implementa `showModal`, los tests de unidad usan un polyfill mínimo de test y el comportamiento real lo cubre Playwright.

**Sin JS.** El banner se sirve con `hidden` y solo el JS lo muestra. Sin JS no se carga GA, así que no hay nada que consentir. «Configurar cookies» es `<a href="/cookies#configurar" data-consent-open>`: con JS abre el panel (`preventDefault`) y sin JS lleva a la sección que lo explica.

## 4. Contratos

### 4.1 Cookie `ng_consent`
- Valor: `v<versión>.<granted|denied>.<savedAt>`, con `savedAt` en segundos epoch (10 dígitos). Ejemplo: `v1.granted.1767225600`. Regex de parseo estricta: `^v([1-9]\d{0,2})\.(granted|denied)\.(\d{10})$`.
- Atributos: `Path=/; Max-Age=31536000; SameSite=Lax; Secure`. Sin `Domain` (cookie solo del host). `Secure` se omite únicamente si `location.protocol === 'http:'` y el host es `localhost` o `127.0.0.1` (desarrollo y preview locales).
- Se considera **sin consentimiento** (se vuelve a preguntar) si el valor falta, está mal formado, la versión es < `CONSENT_VERSION`, `savedAt` está a más de 1 día en el futuro, o `now − savedAt > 31536000`. Este último caso cubre a los navegadores que no respetan `Max-Age`.
- `CONSENT_VERSION = 1`. Se sube cuando cambian las finalidades (por ejemplo, una cookie nueva). Al subirla se vuelve a preguntar a todo el mundo.

### 4.2 API (`src/lib/consent/core.ts`, `state.ts`, `analytics.ts`)
```ts
export const CONSENT_COOKIE = 'ng_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_S = 31_536_000;
export type Consent = { version: number; analytics: boolean; savedAt: number };

parseConsent(cookieHeader: string, nowS: number): Consent | null
serializeConsent(analytics: boolean, nowS: number, opts: { secure: boolean }): string // cadena para document.cookie
needsPrompt(c: Consent | null): boolean
gaCookiesToClear(cookieHeader: string): string[]          // '_ga' y '_ga_*' presentes
expireCookieWrites(name: string, hostname: string): string[] // sin Domain, Domain=host y Domain=.dominio-registrable

// state.ts — reductor puro
type View = 'hidden' | 'banner' | 'panel';
type UiState = { view: View; draft: boolean; saved: Consent | null; prevView: View };
type Action =
  | { type: 'init'; saved: Consent | null }
  | { type: 'accept' } | { type: 'reject' }            // banner o panel («… todo»)
  | { type: 'open' } | { type: 'toggle' } | { type: 'save' }
  | { type: 'escape' };
reduce(s: UiState, a: Action): UiState
// open: el panel arranca con draft = saved?.analytics ?? false (elección actual precargada)
// escape en panel: vuelve al banner si saved es null; si no, se oculta. escape en banner: sin efecto

// analytics.ts
isValidGaId(id: string | undefined): id is string   // ^G-[A-Z0-9]{4,15}$
gtagCommands(gaId: string): unknown[][]           // secuencia exacta de §4.3, testeable
loadAnalytics(gaId: string, doc: Document, win: Window): void   // idempotente
revokeAnalytics(gaId: string, doc: Document, win: Window): void
```

### 4.3 Carga de GA4 (Consent Mode v2, modo básico)
No existe ninguna etiqueta de Google en el HTML. Solo tras `granted`, y solo si hay un `gaId` válido:
1. `win.dataLayer = win.dataLayer || []`; `gtag` se define como `function gtag(){ dataLayer.push(arguments) }`. **Tiene que empujar el objeto `arguments`, no un array**, o gtag.js lo ignora. Hay un test que comprueba `Object.prototype.toString.call(item) === '[object Arguments]'`.
2. `gtag('consent','default',{ ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', analytics_storage:'granted' })`
3. `gtag('js', new Date())`; `gtag('config', gaId, { allow_google_signals:false, allow_ad_personalization_signals:false })`
4. Se inyecta `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}">`. Es un script externo y está permitido por la CSP.

Revocación (de `granted` a `denied`): `win['ga-disable-'+gaId] = true`, `gtag('consent','update',{analytics_storage:'denied'})` y borrado de `_ga` y `_ga_*` con las variantes de dominio. No se recarga la página.

### 4.4 Eventos y atributos
- **Reabrir el panel:** un clic en cualquier `[data-consent-open]` (delegado en `document`) o `document.dispatchEvent(new CustomEvent('ng:consent-open'))`.
- **Emitido tras guardar:** `document` → `CustomEvent('ng:consent-change', { detail: { analytics: boolean } })`.
- **Datos al cliente:** `<div id="ng-consent" data-ga-id="G-…">`. El atributo se omite si no hay ID. Nada de scripts en línea.
- **Anuncio:** una región `role="status"` visualmente oculta dice «Preferencia guardada: analítica aceptada|rechazada». Sustituye al estado «done» del mock, que era solo una demostración.

### 4.5 `check:release` (`scripts/check-release.mjs`)
- Recorre los nodos de texto visibles de `dist/**/*.html` (jsdom; ignora `<script>` y `<style>`) buscando `/\[[^\]\n]{2,}\]/`. Detecta `[FECHA DE PUBLICACIÓN]`, `[Registro Mercantil…]` y `_ga_[ID]`.
- Comprueba también que `PUBLIC_GA_ID` está definido y es válido.
- Modos: `--strict` sale con código 1 si encuentra algo. Sin flag, imprime avisos y sale con 0.
- Scripts npm: `"check:release": "node scripts/check-release.mjs --strict"`. `"build": "astro build && node scripts/check-release.mjs"`, que es estricto solo si `RELEASE_STRICT=1`.
- **Uso:** en CI se ejecuta, pero no bloquea (`continue-on-error`) y aparece en amarillo. En Cloudflare Pages, Nando define `RELEASE_STRICT=1` **solo en el entorno Production** justo antes de apuntar el dominio. Desde ese momento, un build de producción con pendientes falla y Cloudflare mantiene el despliegue anterior. Las previews siguen saliendo con avisos.

## 5. Casos límite

| Caso | Comportamiento |
|---|---|
| Sin JS | El banner sigue con `hidden` y GA nunca se carga. «Configurar cookies» lleva a `/cookies#configurar`, donde un `<noscript>` dice «Sin JavaScript no se instala ninguna cookie de analítica». |
| Cookies bloqueadas o `document.cookie` lanza una excepción (iframe con sandbox) | Todo acceso va en try/catch. Tras guardar se relee la cookie: si no persiste, la elección vale solo para esta página (si es «aceptar», GA se carga igualmente; GA tampoco podrá escribir cookies) y el banner vuelve a salir en la siguiente navegación. No se muestra ningún error. |
| `PUBLIC_GA_ID` vacío o inválido | `getGaId()` devuelve `null` y el build lo avisa por consola sin romper. No hay `data-ga-id`. La UI de consentimiento funciona igual (guarda `ng_consent`) y `loadAnalytics` no llega a llamarse. La tabla de cookies muestra `_ga_[ID]`, así que `check:release` falla, que es lo correcto. |
| Consentimiento caducado, de versión antigua, malformado o con fecha futura | `parseConsent` devuelve `null`, el banner reaparece y el panel arranca con la analítica desactivada. |
| Revocar tras aceptar | Se aplica §4.3 (revocación) y la página no se recarga. |
| Teclado | Skip link «Saltar al contenido» → `#main`. El banner va en el DOM antes de la página para que se alcance pronto, y no roba el foco al cargar. El panel lleva el foco al título (`tabindex=-1`) y devuelve el foco al disparador; si el disparador ya no es visible (botón del banner), lo lleva a `#main`. El switch es `<button role="switch" aria-checked aria-labelledby>`. El contenedor de la tabla tiene `tabindex=0` y `role="region"` con `aria-label` para poder desplazarlo con el teclado. Todos los focos son visibles: `:focus-visible` con un contorno de 2px en `--ink`. |
| `prefers-reduced-motion` | Las únicas transiciones (el botón del switch y el `scroll-behavior: smooth` de las anclas) van dentro de `@media (prefers-reduced-motion: no-preference)`. |
| 320 px | La nav se reparte en varias líneas (`flex-wrap`, como dice el README). Los titulares usan los `clamp()` del diseño con `overflow-wrap: anywhere; hyphens: auto`. Las filas del `<dl>` se apilan. La tabla hace scroll dentro de su contenedor. El banner usa `inset-inline: 16px; bottom: 16px; max-width: 560px`. El panel usa `width: min(600px, 100% - 32px); max-height: calc(100dvh - 32px); overflow: auto`. |
| Rutas | `/aviso-legal` (sin barra) es la canónica. Cloudflare redirige `/aviso-legal.html` a `/aviso-legal`. `404.html` lo sirve Cloudflare automáticamente. |
| Previews `*.pages.dev` | `X-Robots-Tag: noindex` mediante `_headers` (§7). |

## 6. Plan de pruebas

- **Unidad (Vitest, `npm test`):** `core` (parseo y serialización ida y vuelta, caducidad, versión, fecha futura, valores basura), `state` (tabla completa de transiciones), `analytics` (orden exacto de comandos, `arguments`, idempotencia, revocación, borrado de cookies con jsdom), `ga.ts` (IDs válidos e inválidos), `tokens` (A10), `_headers` (A16), `check-release` (fixtures HTML en `tests/fixtures/`). Entorno node por defecto y `// @vitest-environment jsdom` en los ficheros que necesitan DOM. La cobertura v8 aplica el umbral del 95 % solo a `src/lib/consent/**`.
- **Sobre `dist/` (Vitest, `npm run test:dist`, tras `npm run build`):** helpers que cargan cada HTML con `new JSDOM(html)` (sin `runScripts`) y comprueban A3–A9 y A11. También hay un test que construye con `PUBLIC_GA_ID=G-TEST1234` en un directorio temporal (`astro build --outDir`) y verifica que aparece `data-ga-id` y que sigue sin haber referencias a Google en el HTML.
- **E2E (Playwright + `@axe-core/playwright`, `npm run test:e2e`, P11):** solo Chromium y solo en GitHub Actions. Cloudflare Pages ni lo necesita ni tiene navegador garantizado. El coste es unos 60–90 s por ejecución y la descarga de Chromium, que entra en el tiempo de CI gratuito. Merece la pena porque A6, A13, A14 y A15 son exigencias legales y de accesibilidad que jsdom no puede demostrar (red real, `inert`, foco y layout). Usa `webServer: npm run preview` y un build con `PUBLIC_GA_ID=G-TEST1234`. Las peticiones a Google se interceptan con `page.route` (se devuelve 204 y se cuentan). Escenarios: (1) ninguna petición a Google antes de decidir ni tras rechazar; (2) aceptar → petición a `googletagmanager.com`; (3) recargar → no hay banner y GA se carga; (4) «Configurar cookies» en el pie de las 4 páginas abre el panel con la elección precargada; (5) Tab o Escape y vuelta del foco; (6) axe en las 4 páginas × {banner, panel}; (7) 320 px sin scroll horizontal.
- **Manual:** Lighthouse (A18) y comprobación desde fuera del dominio real (`curl -sI https://nandogomez.com` muestra las cabeceras de §7). Se registra en el PR de publicación.

## 7. Riesgos y seguridad

**`public/_headers`:**
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
| Astro mete en línea un script o un estilo y la CSP lo bloquea en producción, aunque en dev funcione porque `_headers` no se aplica allí | A5 (dist-test) lo detecta en el PR. Plan B: hashes en la cabecera generados en el build. No es `'unsafe-inline'`. |
| La CSP se rompe en una preview sin que nadie lo vea | Escenario e2e con la cabecera aplicada: Playwright inyecta la CSP de `_headers` con `page.route` y falla ante cualquier `securitypolicyviolation`. |
| Los dominios de GA cambian (por ejemplo `region1.google-analytics.com`) | Comodines `*.google-analytics.com` / `*.analytics.google.com` / `*.googletagmanager.com`, según la guía de Google para GA4. La lista CSP permite esos hosts siempre, pero solo el código los usa tras el consentimiento (A6). |
| HSTS sin `includeSubDomains`/`preload` | Es deliberado: no se sabe qué subdominios usará Nando. Se puede ampliar más adelante. |
| Enlaces externos | No se usa `target="_blank"`. Si se añadiera alguno, tiene que ir con `rel="noopener noreferrer"` (lo vigila un dist-test). |
| `mailto:` expuesto a recolectores de correo | Se acepta: el correo ya figura en los textos legales. Email Routing filtra en origen. |
| Privacidad | Sin GA antes de consentir. Señales de Google y personalización de anuncios desactivadas en la configuración y en la consola de GA4. Se borran las cookies `_ga` al revocar. Fuentes e imagen autoalojadas. |
| Cadena de suministro | `npm ci` con lockfile y versiones fijadas exactas en `package.json`. `npm audit --omit=dev` se ejecuta en local antes de publicar. |
| Node antiguo en Cloudflare (por defecto, 18) | `.node-version` con `24`. El primer build de Cloudflare debe mostrar Node ≥ 22.23.4 en el log. Si la imagen no acepta solo el número mayor, se fija una versión exacta o `NODE_VERSION`. |

## 8. Pasos

Reglas para todos los pasos: rama `feat/web-pN`, un PR por paso, primero los tests en ROJO, CI verde y diff de 300 líneas o menos (sin contar `package-lock.json` ni binarios). Ningún paso deja `main` con tests rojos.

**P0 — Bootstrap** (`feat/web-p0`)
- Entra: `package.json` con versiones exactas (astro 7.4.2, @astrojs/check 0.9.12, typescript 6.0.3, vitest 5.0.5) y los scripts `dev`, `build`, `preview`, `typecheck` (`astro check`), `test` (`vitest run`). También `astro.config.mjs` (§3, todavía sin sitemap), `tsconfig.json` (`extends: "astro/tsconfigs/strictest"`), `.node-version`, `.gitignore` (`node_modules`, `dist`, `.astro`, `coverage`, `test-results`), `vitest.config.ts`, `src/lib/site.ts`, un `src/pages/index.astro` mínimo (h1 «Nando Gómez») y `docs/ci.yml.txt`.
- ROJO: `tests/unit/site.test.ts` exige `SITE_URL === 'https://nandogomez.com'` y que `EMAIL` sea `hola@nandogomez.com`.
- Acepta: `npm ci && npm run typecheck && npm test && npm run build` en verde; existe `dist/index.html`; `docs/ci.yml.txt` es idéntico al bloque de §9.1.

**P1 — Tokens, fuentes, BaseLayout y arnés de dist** (`feat/web-p1`)
- Entra: `tokens.css`, `global.css`, fontsource (6 subconjuntos latin), `BaseLayout.astro` (lang, title, description, canonical, skip link y `<main id="main" tabindex="-1">`), `vitest.dist.config.ts`, `tests/dist/helpers.ts` y el script `test:dist`. La home sigue siendo un marcador de posición.
- ROJO: `tokens.test.ts` (A10); `dist/base.test.ts` (A4, A5, A9, lang=es, canonical absoluto).
- Acepta: los tests de arriba en verde; las 3 dudas de P0 resueltas, con el resultado anotado en la descripción del PR.

**P2 — Componentes legales, `/aviso-legal` y `/privacidad`** (`feat/web-p2`)
- Entra: `Header` (variante legal), `Footer` unificado, `SectionLabel`, `DefinitionRows`, `LegalLayout`, `lib/legal.ts` y las dos páginas con los textos de `design/`, incluido el texto corregido de §10.1 en Privacidad. El teléfono va como `tel:+34603242682`.
- ROJO: `dist/legal.test.ts` (Aviso legal con 7 `h2` y 7 filas `dt/dd`; Privacidad con 6 `h2`, bloques A y B con 4 filas y la frase de los 14 meses de §10.1; A8 en ambas páginas).
- Acepta: tests en verde. Los enlaces a `/cookies` se validan en P3, que es cuando existe la ruta.

**P3 — `/cookies`, 404 y comprobador de enlaces** (`feat/web-p3`)
- Entra: `CookieTable` (con nombre `_ga_<ID sin "G-">` si hay ID y `_ga_[ID]` si no), página con `id="configurar"`, `<noscript>`, el texto de §10.1 en Cookies y `404.astro`.
- ROJO: `dist/cookies.test.ts` (4 `h2`, 3 filas, región desplazable con `tabindex=0`, `#configurar` existe); `dist/links.test.ts` (A7); A3 completo.
- Acepta: tests en verde y 0 enlaces internos rotos.

**P4 — `check:release`** (`feat/web-p4`)
- Entra: `scripts/check-release.mjs` (§4.5), los scripts `check:release` y `build` encadenado, y `tests/fixtures/release/{ok,pendiente}.html`.
- ROJO: `check-release.test.ts` (sale con 1 ante `[FECHA DE PUBLICACIÓN]`, `_ga_[ID]` o la falta de GA ID; sale con 0 ante el fixture limpio con ID; en modo aviso siempre sale con 0; ignora corchetes dentro de `<script>`/`<style>`).
- Acepta: tests en verde; `npm run check:release` sobre el `dist/` real falla y lista los 5 pendientes (3 fechas, el Registro y `_ga_[ID]`).

**P5 — Núcleo de consentimiento puro** (`feat/web-p5`)
- Entra: `src/lib/consent/core.ts` y `state.ts`.
- ROJO: `core.test.ts` y `state.test.ts` con todos los casos de §4.1, §4.2 y §5. Los tests van primero.
- Acepta: tests en verde y cobertura ≥ 95 % en estos ficheros (A12).

**P6 — Analítica (GA4, Consent Mode v2 básico)** (`feat/web-p6`)
- Entra: `lib/ga.ts` y `lib/consent/analytics.ts`.
- ROJO: `analytics.test.ts` (jsdom): nada en `dataLayer` ni ningún `<script>` antes de `loadAnalytics`; secuencia exacta de §4.3; elementos de tipo `Arguments`; doble llamada → un solo script; revocación → `ga-disable-*` y cookies `_ga*` caducadas. `ga.test.ts`: ID vacío, mal escrito o con espacios → `null`.
- Acepta: tests en verde y cobertura ≥ 95 %.

**P7 — UI de consentimiento** (`feat/web-p7`)
- Entra: `ConsentManager.astro` (banner con «Rechazar» y «Aceptar» de estilo idéntico, «Configurar»; `<dialog>` con «Rechazar todo», «Aceptar todo» y «Guardar selección» en lima; switch; región de estado) y `scripts/consent-ui.ts`, montado en `BaseLayout`.
- ROJO: `consent-ui.test.ts` (jsdom): sin cookie se muestra el banner; con una cookie válida no; un clic en `[data-consent-open]` abre el panel con la elección precargada; Escape sin elección guardada vuelve al banner; al cerrar, el foco vuelve al disparador; «Aceptar» escribe una cookie con el formato de §4.1 y llama a `loadAnalytics` solo si hay `data-ga-id`; se emite `ng:consent-change`. `dist/consent.test.ts`: el banner sale con `hidden` en todas las páginas; los dos botones del banner tienen la misma lista de clases; con ID de prueba existe `data-ga-id` (A2, A6).
- Acepta: tests en verde, A5 sigue en verde y la prueba manual en la preview es correcta.

**P8 — Home I: cabecera, hero, retrato y servicios** (`feat/web-p8`)
- Entra: `Header` (variante home, con «Contactar» en estilo secundario según §10.2), `Button`, `Portrait` (`<Picture formats={['avif']} fallbackFormat="webp" widths={[360,560,800]} sizes="(min-width: 1024px) 400px, calc(100vw - 48px)" priority>`), `ServiceCard`, y las secciones `#inicio` y `#servicios`. El `<SectionLabel as="h2">` de servicios evita que se salte un nivel de encabezado entre `h1` y `h3`.
- ROJO: `dist/home.test.ts` (A11; 3 `article` con `h3`; existen `#inicio` y `#servicios`; dentro de cada `section` hay como máximo un `.btn--primary`).
- Acepta: tests en verde.

**P9 — Home II: método, sobre mí, Digital Twofers y contacto** (`feat/web-p9`)
- Entra: `MethodStep`, las secciones `#metodo`, `#sobre-mi` (dl con la variante profile), `#twofers` y `#contacto`, y `Footer`.
- ROJO: se amplía `dist/home.test.ts` (4 pasos «01…04»; existen los 6 `id` de ancla; los enlaces externos son exactamente los 4 permitidos: twofers.es, LinkedIn, aepd.es y mailto; A7 y A8 en la home).
- Acepta: tests en verde y la comparación visual con `design/Tecnico.dc.html` (escritorio y 320 px) documentada con capturas en el PR.

**P10 — Cabeceras y SEO** (`feat/web-p10`)
- Entra: `public/_headers` (§7), `@astrojs/sitemap` 3.7.4, `robots.txt`, `favicon.svg`, OG (`og:title`, `og:description`, `og:url`, `og:image` con el retrato a 800px y `og:locale=es_ES`) y `theme-color` `#0e0f11`.
- ROJO: `headers.test.ts` (A16, directiva a directiva; no hay `unsafe-inline` ni `unsafe-eval`); `dist/seo.test.ts` (el sitemap contiene exactamente `/`, `/aviso-legal`, `/privacidad` y `/cookies` sin barra final y sin `404`; `robots.txt` apunta al índice).
- Acepta: tests en verde.

**P11 — E2E y accesibilidad** (`feat/web-p11`)
- Entra: `@playwright/test` 1.64.1, `@axe-core/playwright` 4.14.0, `playwright.config.ts`, `e2e/*.spec.ts` (los escenarios de §6) y el script `test:e2e`. El paso de CI se activa solo cuando aparece `playwright.config.ts`, así que Nando no tiene que editar `ci.yml`.
- ROJO: las specs se escriben antes de cualquier ajuste de CSS o JS que hagan falta para que pasen.
- Acepta: A6, A13, A14 y A15 en verde en GitHub Actions.

Dependencias: P0 → P1 → {P2 → P3 → P4}; P0 → P5 → P6 → P7 (necesita P1); P8 y P9 necesitan P2 y P7; P10 necesita P9; P11 necesita P10. P5 y P6 pueden ir en paralelo con P2–P4.

## 9. Pasos manuales de Nando (en orden)

1. **Antes de P0:** crea `samdaad/nandogomez-web` en GitHub **marcando «Add a README»**. Así `main` existe y los PR tienen una base; en local `main` todavía no tiene commits. Desde tu Terminal:
   `git remote add origin https://github.com/samdaad/nandogomez-web.git && git fetch origin && git rebase origin/main feat/web-inicial && git push -u origin feat/web-inicial`
   Después abre el PR `feat/web-inicial` → `main` desde la web. P0 sale de `main` una vez mergeado este PR.
2. **Tras mergear P0:** en GitHub web, *Add file → Create new file* → `.github/workflows/ci.yml`, pega el contenido de `docs/ci.yml.txt` y haz commit en `main`. Tu token no tiene permiso `workflow`, por eso este paso va por la web.
3. **(Opcional)** *Settings → Branches*: protege `main` exigiendo el check `CI / verify`.
4. **Cloudflare Pages:** *Workers & Pages → Create → Pages → Connect to Git* → `samdaad/nandogomez-web`. Preset Astro, build command `npm run build`, output `dist`, rama de producción `main`. Comprueba en el primer log que usa Node ≥ 22.23.4.
5. **Cuando exista P6 (o antes):** crea la propiedad GA4 y un flujo web para `https://nandogomez.com`. En *Administrar → Recogida y conservación de datos → Conservación de datos*, pon **14 meses**. El valor por defecto de GA4 es 2 meses y entonces el texto de privacidad sería falso. Desactiva las señales de Google y la personalización de anuncios. Copia el ID `G-…`.
6. En Cloudflare Pages, *Settings → Variables*, define `PUBLIC_GA_ID=G-…` en **Production y Preview**. Si quieres que el aviso de CI salga en verde, defínelo también como *Repository variable* en GitHub con el mismo nombre.
7. Rellena los pendientes en `src/lib/legal.ts`: fecha de publicación y datos del Registro Mercantil. Hazlo en un PR propio de contenido.
8. **Email Routing:** en Cloudflare, en la zona `nandogomez.com`, *Email → Email Routing*. Crea `hola@nandogomez.com` → tu Gmail, verifica el destino y deja que Cloudflare añada los registros MX y SPF.
9. **Antes de apuntar el dominio:** define `RELEASE_STRICT=1` solo en **Production**, lanza un redeploy y comprueba que el build pasa (sin pendientes). Mide Lighthouse en la preview (A18).
10. **Dominio:** en Pages, *Custom domains*, añade `nandogomez.com` y `www.nandogomez.com`. Con una *Redirect Rule*, redirige `www` → apex con un 301.
11. **Comprobación desde fuera:** `curl -sI https://nandogomez.com | grep -i -E 'content-security|strict-transport'`. Abre la web en una ventana privada y confirma en las herramientas de red que no hay peticiones a Google hasta que aceptas. Envía un correo de prueba a hola@.

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
Lo que bloquea es typecheck, unidad, build, dist y e2e. Lint (que hoy no hay) y `check:release` son solo informativos. `--if-present` y la condición `hashFiles` hacen que este fichero no tenga que tocarse más.

## 10. Incoherencias de contenido: correcciones propuestas (Nando las aprueba)

**10.1. «14 meses» frente a «2 años».** Las dos cifras son correctas, pero hablan de cosas distintas: cuánto tiempo guarda Google los datos y cuánto vive la cookie en el navegador.
- *Privacidad, bloque B, «Conservación»:* «Google Analytics conserva los datos de navegación 14 meses y después los elimina automáticamente. Es un plazo distinto de la duración de las cookies en tu navegador (hasta 2 años), que se detalla en la política de cookies.»
- *Cookies, tras la tabla:* «La duración indica cuánto tiempo permanece la cookie en tu navegador si no la borras antes. Los datos que recoge Google Analytics se conservan 14 meses, como explica la política de privacidad. Si retiras tu consentimiento, borramos las cookies _ga de tu navegador.»
- Columna «Duración» de `_ga` y `_ga_…`: «2 años (en tu navegador)».
- La condición es configurar la conservación a 14 meses en GA4 (paso 5 de §9). Si no, el texto tiene que decir 2 meses.

**10.2. Dos botones lima visibles a la vez en la home.** «Contactar» de la cabecera pasa a ser **botón secundario**: borde `--border-strong`, texto `--ink`, mismo padding y radio `--radius-sm`. Se mantiene como llamada a la acción en la navegación, sin competir con el lima. «Agenda una llamada» (hero) y «Escríbeme» (contacto) siguen en lima: nunca coinciden en pantalla, porque los separan más de un viewport en todos los anchos. En el panel de cookies, «Guardar selección» es el único lima: el banner se oculta mientras el panel está abierto.

**Otras observaciones para Nando (no bloquean):**
- «Agenda una llamada» lleva a `#contacto`, donde solo hay correo y LinkedIn. O se cambia el texto a «Hablemos» o se añade un enlace de agenda (Cal.com o Google Calendar). Esto último añade un tercero a la CSP y a la privacidad.
- Confirma que OK Humedades, RG Compact y DEOR Consultores aceptan aparecer por su nombre.
- `--border-control` (#3A3D44) y `--overlay` deberían entrar en `tokens.json`.
- El pie de Aviso legal y de Privacidad no tenía «Configurar cookies». Se unifica (A8) porque la política de cookies afirma que está en todas las páginas.
