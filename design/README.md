# Nando Gómez

Sistema de diseño de la marca personal de Nando Gómez: consultor tecnológico, formador y asesor de empresas. Se usa en nandogomez.com y en todo lo que salga con su nombre (presentaciones, propuestas, tarjeta de contacto). Es una marca separada de Digital Twofers: no comparte colores ni logotipo con ella.

## Idea

**Tecnología sin humo.** Aspecto de herramienta técnica actual (oscuro, preciso, tipografía Geist con detalles monoespaciados) al servicio de un mensaje claro y cercano. La precisión la pone el diseño; la cercanía, el texto y la foto.

## Voz y contenido

- Se habla de tú, en primera persona: «Ayudo a empresas a…», «Cuéntame qué quieres resolver».
- Frases cortas, verbos concretos. Nada de jerga sin explicar ni promesas infladas.
- Sin cifras inventadas: un número solo aparece si es real y verificable.
- Titulares con una parte apagada en `ink-subtle` para dar ritmo: «…usar la tecnología **sin humo.**»
- Etiquetas de sección en minúsculas mono con barra: `/ servicios`, `/ cómo trabajo`, `/ mi empresa`.

## Fundamentos visuales

**Color.** Un solo tema, oscuro. Fondo `bg`, bloques en `surface` con borde `border` de 1px; las secciones se separan con `divider` a todo el ancho. Texto en `ink`, secundario en `ink-muted`.

**El lima (`lime`) es escaso a propósito.** Va en el botón principal, el punto de estado, los números de paso, los iconos y el anillo interior del retrato. Nunca como fondo de una sección, nunca en párrafos, nunca más de un botón lima por pantalla visible. El texto sobre lima es siempre `on-lime`.

**Tipografía.** Geist para todo; Geist Mono solo para etiquetas, numeración y pies. Titulares en peso 600 con interletraje negativo (`display`: -0.045em). Las fuentes se cargan desde Google Fonts:
`https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap`

**Forma.** Esquinas redondeadas moderadas (`radius-md` en botones, `radius-lg` en tarjetas), bordes finos en lugar de sombras. Sin degradados, sin sombras, sin tarjetas con borde de color a la izquierda.

**Espacio.** Contenido a un máximo de `content-max`, margen lateral `space-6`, mucho aire entre secciones (`space-28`). En móvil todo se apila en una columna; la navegación se reparte en varias líneas en lugar de esconderse.

## Fotografía

El retrato principal es circular (`radius-full`), con doble anillo: exterior `border-strong` de 1px con 10px de separación, interior `lime` de 1px. Se prefieren fotos reales en acción (formando, presentando) a retratos de estudio. Pie de foto en `label` mono. Archivo en el grupo Fotografia.

## Iconografía

Iconos lineales de 24px con trazo 1,6 y extremos redondeados, en `lime`, sin relleno. Uno por tarjeta de servicio como máximo. Nunca emojis.

## Componentes

- **Button**: principal (lima) y secundario (borde).
- **SectionLabel**: etiqueta mono de sección.
- **ServiceCard**: tarjeta de servicio con icono, título y descripción.
- **Portrait**: retrato circular con doble anillo y pie.
