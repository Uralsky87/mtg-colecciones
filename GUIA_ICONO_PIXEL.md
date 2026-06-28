# Guia rapida: nuevo icono pixel-art para ManaCodex

## Objetivo
Sustituir el icono actual por uno coherente con la UI retro/pixel de la app, manteniendo identidad visual y buena legibilidad en movil.

## Paleta recomendada (alineada con la app)
- Fondo claro: `#E7E7EA`
- Panel claro: `#F6F6F8`
- Borde/sombra oscura: `#2A2A2E`
- Azul acento: `#2FB7A3`
- Coral acento: `#FF6B6B`
- Violeta acento: `#7A5CFA`
- Mostaza acento secundario: `#E1B12C`

## Concepto recomendado (A): Cristal de mana pixel
Descripcion visual:
- Icono cuadrado 1:1.
- Cristal/rombo central grande estilo 8-bit o 16-bit.
- Mitad superior-izquierda en azul, mitad inferior-derecha en coral.
- Borde oscuro grueso tipo pixel (2-3 px en un lienzo 1024).
- Sombra dura desplazada abajo-derecha.
- Fondo simple claro con textura sutil de cuadricula pixel (muy tenue).
- Sin texto.

### Prompt maestro (A)
"App icon for a fantasy card collection app, strict pixel art style, centered large mana crystal (diamond shape), split into two color halves (teal-blue and coral-red), thick dark pixel outline, hard drop shadow to bottom-right, minimal clean background light gray with subtle pixel grid texture, high contrast, readable at very small sizes, no text, no characters, no realistic rendering, retro 16-bit UI aesthetic, perfectly centered composition, square icon, premium polished pixel art"

### Prompt negativo (A)
"no photorealism, no gradients airbrush, no faces, no demons, no merfolk, no complex scene, no tiny details, no text, no logo letters, no blur, no glow bloom, no thin outlines"

## Variante B: Libro codex pixel con M
Descripcion visual:
- Libro abierto en pixel art, centrado.
- En la portada una "M" pixel grande en violeta.
- Dos pips pequenos (azul y coral) como guiño al icono anterior.
- Borde oscuro grueso y sombra dura.
- Fondo claro liso.

### Prompt maestro (B)
"Square app icon, retro pixel art style, centered open codex book, bold pixel letter M on the cover in violet, two small mana pips in teal and coral, thick dark pixel outline, hard shadow, clean light background, high contrast, highly readable at 48px, no text outside the symbol, minimal composition, polished 16-bit interface style"

### Prompt negativo (B)
"no photorealism, no handwritten text, no ornate illustration, no characters, no wings, no tentacles, no soft blur, no glossy 3d"

## Variante C: Duo clasico (merfolk + demonio) en pixel art limpio
Descripcion visual:
- Mantener el simbolo circular dual (arriba figura azul tipo merfolk, abajo figura roja tipo demonio).
- Reducir detalle interno: menos lineas, menos sombreado, bloques de color mas grandes.
- Bordes escalonados claros y consistentes (pixel perfect).
- Fondo gris claro liso, sin textura compleja.
- Silueta muy legible a 48x48.

### Prompt maestro (C)
"Square app icon, strict retro pixel art, yin-yang circular emblem with two fantasy silhouettes, upper figure blue merfolk-like profile with flowing tentacle hair, lower figure red demon-like profile with single wing, simplified shapes, chunky pixels, clean stepped outlines, limited palette, high contrast, minimal shading, no micro details, centered composition, light neutral background, icon readable at very small size"

### Prompt negativo (C)
"no photorealistic style, no smooth vector curves, no soft blur, no 3d render, no extra creatures, no tiny ornaments, no text, no heavy texture"

### Ajustes para que quede menos recargado
- Pedir 3 niveles maximos de sombra por color.
- Pedir contorno exterior mas grueso que los contornos internos.
- Pedir que el borde del emblema no se corte en ninguna esquina.
- Pedir una version extra con alas mas simples (2 pliegues en vez de 5).

## Parametros recomendados de generacion
- Formato: PNG
- Relacion: 1:1
- Resolucion base: 1024x1024
- Estilo: pixel-art estricto
- Variaciones: generar 8-12 por concepto

## Criterios de seleccion (checklist)
- Se entiende la forma principal al verlo a 48x48.
- Silueta clara sobre fondo claro.
- Maximo 4-6 colores principales.
- Sin microdetalles que desaparezcan al reducir.
- Sin texto fino.
- Mantiene coherencia con UI retro de ManaCodex.

## Export final para la app
Generar estos archivos finales:
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/maskable-192.png`
- `icons/maskable-512.png`

Nota para maskable:
- Dejar margen de seguridad interno de 20% para que Android no recorte el motivo principal.

## Recomendacion final
Usar el concepto A (cristal de mana pixel) como principal.
Usar el concepto B como alternativa de backup si quieres reforzar el "Codex" de marca.
Si quieres mantener la identidad historica del icono actual, usar el concepto C como puente visual.
