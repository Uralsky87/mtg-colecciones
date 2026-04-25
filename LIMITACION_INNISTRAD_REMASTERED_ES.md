# Limitacion Tecnica: Innistrad Remastered en Espanol

## Estado decidido

A fecha de abril de 2026, `Innistrad Remastered` no se expone en la app como set con espanol disponible.

Decision aplicada:

- no mostrar bandera ni cambio efectivo a espanol para `inr`
- no forzar una excepcion canonicamente espanola para este set
- dejar el caso documentado para posible tratamiento futuro

El objetivo de esta decision es evitar regresiones en inventario, acciones masivas, resolucion de prints y consistencia visual del resto de sets EN/ES.

## Set afectado

- codigo Scryfall: `inr`
- nombre: `Innistrad Remastered`

## Sintoma observado

Durante las pruebas manuales:

- el set mostraba bandera para cambiar a espanol
- al intentar cambiar, parecia cargar y luego volvia a ingles
- en consola aparecian intentos de cargar `inr__es`
- Scryfall respondia `404 Not Found` para el set en papel con `lang:es`

Consulta relevante:

- `game:paper set:inr lang:es`

Resultado observado:

- sin prints espanoles resolubles desde la fuente principal de cartas

## Causa tecnica real

La app usa dos capas distintas que aqui chocan:

1. Metadatos de idioma por set

- MTGJSON y la capa de excepciones permiten declarar que un set puede tener espanol visible en UI
- eso sirve para mostrar o no una opcion de idioma

2. Datos reales de cartas/prints

- la carga operativa del set y la resolucion exacta de variantes usan Scryfall
- para `inr`, Scryfall no devuelve prints `game:paper` en `lang:es`
- por tanto no existe bucket real `inr__es` con cartas utilizables

El problema no es solo visual. En esta app, el idioma del set abierto participa en varias rutas operativas:

- apertura y carga del set
- fusion de variantes exactas por `setCode + collectorNumber + lang`
- render de tabla del set
- acciones masivas de marcado/desmarcado
- algunas decisiones de inventario visible y posesion por idioma

## Por que no conviene forzarlo ahora

Forzar un "espanol sintetico" para `inr` sin prints reales implicaria separar dos conceptos que hoy estan bastante acoplados:

- idioma visible de la interfaz
- idioma fisico real de la impresion

Eso obligaria a introducir una capa nueva de fallback visual sintetico para sets completos, no solo para cartas sueltas.

Riesgos principales:

- escribir cantidades o acciones masivas en un idioma que no tiene print real resuelto
- incoherencias entre tabla, modal, deck, filtros y progreso del set
- reabrir supuestos binarios EN/ES que ya estaban estabilizados en otras rutas
- generar casos especiales dificiles de mantener para una excepcion muy puntual

## Diferencia respecto a Salvat

`Salvat` y `Innistrad Remastered` no son el mismo tipo de excepcion.

Salvat:

- encaja razonablemente en una excepcion de set comercial tratado como espanol
- el comportamiento esperado del producto queda alineado con la disponibilidad util en la app

Innistrad Remastered:

- puede existir como caso comercial discutible de espanol
- pero la fuente operativa real de cartas no expone prints espanoles utilizables para la app
- por eso la excepcion no es solo de UI; es una carencia de datos resolubles

## Solucion futura viable

Si se quisiera soportar este caso mas adelante sin romper el resto, la solucion deberia tratarse como feature nueva, no como parche puntual.

Linea de trabajo recomendada:

1. Introducir un modo explicito de fallback visual sintetico por set.
2. Mantener el set base cargado en ingles cuando no haya bucket real del idioma solicitado.
3. Separar estrictamente:
   - idioma visible del set
   - idioma real del print usado por inventario
4. Blindar acciones masivas para que operen sobre el idioma fisico correcto y no sobre el idioma visual sintetico.
5. Revisar compatibilidad con:
   - render de tabla
   - modal de carta
   - progreso del set
   - deck
   - filtros
   - persistencia v2/v3

## Criterio para reabrir este tema

Solo merece la pena reabrirlo si ocurre al menos una de estas condiciones:

- Scryfall empieza a publicar prints `game:paper` de `inr` en espanol
- se adopta una segunda fuente fiable de prints por idioma real para casos excepcionales
- se decide invertir en la feature general de fallback visual sintetico por set

## Decision de mantenimiento

Hasta nuevo aviso:

- `inr` permanece sin espanol visible en la UI del set
- el caso se considera limitacion conocida y aceptada
- no se intentaran mas parches puntuales sobre este set sin una estrategia general
