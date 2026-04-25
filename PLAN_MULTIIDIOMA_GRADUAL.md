# Plan Tecnico Multidioma Gradual

Nota de contexto actual:

- este documento describe una evolucion futura posible, no el alcance de producto actualmente priorizado
- la direccion activa del producto sigue centrada en EN/ES
- algunas excepciones comerciales no deben forzarse en UI si Scryfall o MTGJSON no exponen prints reales resolubles; el caso mas claro ahora mismo esta documentado en [LIMITACION_INNISTRAD_REMASTERED_ES.md](LIMITACION_INNISTRAD_REMASTERED_ES.md)

## Objetivo

Evolucionar la app desde el modelo actual binario EN/ES hacia un modelo multidioma real, sin hacer un cambio masivo de una sola vez y priorizando seguridad funcional, revisiones frecuentes y pasos pequeños.

La meta de producto deseada es:

- ingles como idioma base por defecto
- idiomas adicionales activables por carta y por set
- selector de idioma visible por botones individuales, no toggle binario
- inventario separado por impresion concreta e idioma real
- acciones masivas aplicables al idioma o idiomas visibles definidos por el usuario

## Estado de partida

### Lo que ya tenemos a favor

- `estado3` ya guarda inventario por `printId`
- el catalogo ya indexa `lang`, `setCode`, `oracleId` y `collectorNumber`
- la UI visible ya no depende completamente del `confirm()` y del viejo toggle basico
- existe una capa inicial de resolucion de variante visible por carta

### Lo que sigue rigido

- gran parte del flujo de posesion sigue hablando en `qty_en`, `qty_es`, `foil_en`, `foil_es`
- la UI de cartas y sets sigue pensada como binario EN/ES
- MTGJSON y Scryfall permiten mas idiomas, pero la app los recorta a EN/ES
- deck, busqueda y algunos filtros siguen arrastrando supuestos `__en`

## Principios del plan

1. No tocar a la vez modelo, UI y acciones masivas si no es imprescindible.
2. Cada fase debe dejar el sistema estable y testeable por separado.
3. Antes de introducir idiomas nuevos, hay que eliminar las suposiciones binarias del nucleo.
4. El inventario nunca debe depender del idioma visible.
5. Las acciones masivas solo deben ampliarse cuando la seleccion visible por set ya sea robusta.

## Decision de estrategia

No empezar mostrando diez idiomas de golpe.

Primero hay que convertir el sistema de EN/ES binario en un sistema dinamico de idiomas soportados. Solo despues tiene sentido abrir idiomas adicionales en UI.

Eso implica dos etapas grandes:

- Etapa A: desbinarizar arquitectura y preferencias
- Etapa B: introducir UI multidioma real por carta y por set

## Fase 0 - Congelar contrato y preparar terreno

Estado: completada

### Objetivo

Documentar el contrato nuevo antes de tocar mas logica.

### Trabajo

- definir una entidad "idioma visible activo" distinta de "idiomas visibles habilitados"
- definir una entidad "idiomas disponibles por set"
- definir una entidad "idiomas disponibles por carta"
- definir como se representara la preferencia visible por set y por carta en `estado3.uiPreferences`

### Propuesta minima de preferencias

```json
{
  "globalFallbackLang": "en",
  "preferredSetLang": {},
  "selectedVariantByCard": {},
  "visibleLangsBySet": {},
  "visibleLangsByCard": {},
  "activeLangBySet": {}
}
```

### Criterio de salida

- contrato de preferencias decidido
- nombres definitivos aprobados
- sin cambios funcionales todavia

### Resultado aplicado

- `estado3.uiPreferences` ya contempla:
  - `visibleLangsBySet`
  - `visibleLangsByCard`
  - `activeLangBySet`
- la normalizacion de preferencias ya acepta codigos de idioma genericos, no solo EN/ES
- la integridad basica ya evita estructuras vacias o incoherentes en esas nuevas claves
- no se ha cambiado aun el comportamiento visible de la UI

### Riesgo principal

- meter demasiadas preferencias redundantes que luego choquen entre si

## Fase 1 - Quitar el binario duro del catalogo

Estado: completada

### Objetivo

Sustituir la idea fija de `SUPPORTED_SET_LANGS = ["en", "es"]` por un sistema dinamico, aunque visualmente la app siga mostrando solo EN/ES temporalmente.

### Trabajo

- reemplazar el mapeo fijo de idiomas por un registro dinamico de idiomas soportados por la app
- conservar una lista de idiomas "habilitados visualmente" separada de los idiomas "existentes en datos"
- hacer que `normalizeSetLangs`, `getSetAvailableLangs`, `setHasLang` y helpers relacionados dejen de asumir dos idiomas
- no cambiar todavia la UI del set ni la busqueda

### Resultado esperado

- el backend de catalogo ya entiende mas idiomas
- la UI sigue acotada y estable

### Criterio de salida

- `setLangsByCode` puede contener idiomas arbitrarios
- los indices v3 siguen funcionando con idiomas distintos de EN/ES
- no hay regresiones en colecciones actuales

### Resultado aplicado

- el catalogo ya normaliza idiomas de set con codigos dinamicos, no solo EN/ES
- la cache de metadatos de set se rehidrata con normalizacion bajo el nuevo contrato
- la UI de colecciones sigue contenida temporalmente a idiomas visibles habilitados en la app
- las entradas de coleccion distinguen entre `dataLangs` y `availableLangs`

## Fase 2 - Generalizar preferencias visibles

Estado: completada

### Objetivo

Convertir las preferencias visibles de binarias a dinamicas, sin cambiar aun el layout final.

### Trabajo

- cambiar `preferredSetLang` para aceptar cualquier idioma real
- añadir `visibleLangsBySet`
- añadir `visibleLangsByCard`
- revisar `selectedVariantByCard` para que no dependa de suponer solo EN/ES
- hacer que `getPreferredVisibleLang` y `resolveVisibleVariantForCard` acepten cualquier idioma valido

### UI temporal

- todavia puede seguir existiendo el comportamiento visual actual, pero por debajo ya no debe depender de `currentLang === "en" ? "es" : "en"`

### Criterio de salida

- preferencias visibles multidioma listas
- sin necesidad de exponer aun mas de dos idiomas al usuario

### Resultado aplicado

- la capa de preferencias visibles ya resuelve idioma activo y lista visible con helpers dinamicos por set y por carta
- `preferredSetLang` pasa a convivir con `activeLangBySet` y `visibleLangsBySet` sin depender de ternarios EN/ES
- `resolveVisibleVariantForCard` ya elige la variante objetivo a partir de idiomas visibles permitidos para esa carta
- el toggle temporal sigue igual de cara al usuario, pero internamente cicla con `getNextVisibleLang(...)` en vez de asumir solo EN y ES
- `selectedVariantByCard` sigue validandose por print real y ya no participa en ninguna suposicion binaria de idioma

## Fase 3 - Reestructurar posesion legada EN/ES

Estado: completada

### Objetivo

Encapsular del todo la vieja lectura/escritura binaria para que el resto del sistema deje de depender de `qty_en` y `qty_es`.

### Trabajo

- crear un adaptador unico de lectura para UI y acciones
- encapsular setters legados en una interfaz mas neutra por idioma arbitrario
- aislar completamente la coexistencia v2/v3 en helpers internos
- preparar la eliminacion futura de columnas binarias en las rutas visibles

### Importante

En esta fase no hace falta borrar `estado2`, pero si reducirlo a compatibilidad interna controlada.

### Criterio de salida

- los flujos visibles usan adaptadores neutros
- los componentes ya no conocen la estructura interna binaria salvo en compatibilidad

### Resultado aplicado

- se ha introducido un adaptador unico de posesion legada con `langs` y `totals` para encapsular `estado2`
- los renders principales de set, paneles de idioma, progreso, busqueda y varias acciones delegadas ya leen posesion a traves de ese adaptador
- los setters visibles siguen operando sobre compatibilidad v2, pero ya normalizan idioma y quedan aislados detras de helpers comunes
- la suma de cantidades y foil en vistas visibles deja de depender de acceder directamente a `qty_en`, `qty_es`, `foil_en` y equivalentes
- las referencias binarias que permanecen quedan acotadas a normalizacion, persistencia y puente interno de compatibilidad v2/v3

## Fase 4 - Selector multidioma por carta

Estado: completada

### Objetivo

Sustituir el toggle actual por el nuevo patron de UX por carta.

### UX objetivo

- ingles visible por defecto
- junto a la bandera base aparece un boton `+`
- el boton abre un panel con idiomas realmente disponibles para esa carta
- cada idioma se representa con bandera y checkbox
- los idiomas marcados quedan habilitados para esa carta
- la carta muestra botones individuales para cada idioma habilitado
- pulsar un boton cambia la carta a esa variante concreta

### Trabajo

- construir helper `getAvailableVariantLangsForCard(card)`
- construir helper `getVisibleLangsForCard(card)`
- añadir panel desplegable por carta
- sustituir el toggle actual por botones de idioma individuales
- revisar accesibilidad y cierre de paneles

### Criterio de salida

- una carta puede habilitar mas de dos idiomas
- el cambio de idioma ya no es un toggle binario
- no se mezclan cantidades entre idiomas

### Resultado aplicado

- el helper `getAvailableVariantLangsForCard(...)` ya calcula idiomas reales por carta a partir del catalogo y cache de variantes
- cada carta y el modal usan el mismo selector visual con botones por idioma visible y panel `+` para marcar idiomas habilitados
- los idiomas sin bandera propia ya degradan a chips de texto en lugar de bloquear la UX multidioma
- el cierre del panel ya funciona por click exterior y por `Escape`
- la lista del set y el modal comparten la misma sincronizacion de variante visible sin volver al toggle binario anterior

## Fase 5 - Selector multidioma por set

### Objetivo

Añadir un control superior en el set para gobernar idiomas visibles del conjunto.

### UX objetivo

- boton o menu en la cabecera del set
- permite:
  - activar idiomas visibles del set
  - desactivar idiomas visibles del set
  - fijar idioma activo del set
  - aplicar configuracion a todas las cartas del set

### Trabajo

- modelar `visibleLangsBySet[setCode]`
- modelar `activeLangBySet[setCode]`
- propagar defaults del set a cartas sin configuracion propia
- decidir precedencia:
  - preferencia explicita de carta
  - preferencia del set
  - fallback global ingles

### Criterio de salida

- el set puede configurarse de forma global
- las cartas heredan esa configuracion salvo override puntual

### Resultado aplicado

- se anade una barra global en la vista del set para elegir idioma activo y lista de idiomas visibles del set
- esa preferencia alimenta `visibleLangsBySet[setCode]` y `activeLangBySet[setCode]`
- las cartas sin override propio heredan la configuracion del set y se re-renderizan al cambiarla

## Fase 6 - Acciones masivas y autocompletar por idioma/idiomas

Estado: completada

### Objetivo

Hacer que las acciones masivas operen sobre el idioma correcto definido por el usuario.

### Opciones de producto a decidir

1. aplicar al idioma activo del set
2. aplicar a todos los idiomas visibles del set
3. pedir idioma explicito en el propio flujo de autocompletar

### Recomendacion

Empezar por opcion 1.

Es la mas simple, predecible y menos peligrosa.

### Trabajo

- revisar "Marcar todas", "Desmarcar todas" y autocompletar
- hacer que operen contra el idioma activo del set
- mostrar claramente en el texto de confirmacion a que idioma se aplican

### Criterio de salida

- acciones masivas sin ambiguedad
- inventario escrito siempre contra prints del idioma objetivo

### Resultado aplicado

- `Marcar todas` y `Desmarcar todas` ya operan sobre el idioma activo del set, no sobre un idioma implicito por carta ni sobre ambos idiomas a la vez
- el bloque de autocompletar por rangos suma cantidades sobre el idioma activo del set para mantener coherencia con el selector global
- las confirmaciones de acciones masivas indican explicitamente si la operacion se aplicara en ingles o en español

## Fase 7 - Busqueda y deck multidioma

### Objetivo

Eliminar los ultimos supuestos duros de EN/ES o `__en` en vistas secundarias.

### Trabajo

- busqueda con idiomas reales disponibles por print
- deck usando preferencia visible real, no solo `__en`
- verificar cartas del deck contra `estado3` por print e idioma
- revisar modo imagenes y modo lista del deck

### Criterio de salida

- deck y busqueda ya no fuerzan ingles como unica base visible

## Fase 8 - Limpieza final y retiro progresivo del binario

### Objetivo

Dejar EN/ES como un caso particular del sistema general, no como base del codigo.

### Trabajo

- reducir dependencias directas de `qty_en`, `qty_es`, `foil_en`, `foil_es`
- aislar o deprecar `estado2`
- limpiar helpers legacy que solo tienen sentido en binario
- revisar export/import para que el backup sea coherente con el nuevo sistema

### Criterio de salida

- el sistema puede soportar cualquier idioma disponible sin tocar estructura

## Orden recomendado de implementacion

1. Fase 0
2. Fase 1
3. Fase 2
4. Revision funcional
5. Fase 3
6. Revision funcional
7. Fase 4
8. Revision UX
9. Fase 5
10. Revision funcional
11. Fase 6
12. Fase 7
13. Fase 8

## Checkpoints de revision

Despues de cada fase importante conviene revisar:

- no se mezclan cantidades entre idiomas
- un idioma inexistente no crea fallbacks peligrosos
- el idioma visible no pisa inventario
- el progreso del set y las stats siguen cuadrando
- deck y busqueda no muestran cantidades incoherentes

## Riesgos conocidos

### 1. Explosion visual de idiomas

Si una carta tiene muchos idiomas, mostrar todos a la vez puede recargar mucho la UI.

Mitigacion:

- panel desplegable
- lista filtrable
- limite de idiomas visibles activos por carta o por set si hiciera falta

### 2. Datos incompletos por set o por print

No todas las cartas de un set existen en todos los idiomas del set.

Mitigacion:

- siempre resolver por carta concreta, no solo por set
- mostrar solo idiomas realmente disponibles para esa carta

### 3. Deuda binaria residual

Aunque abramos idiomas en UI, si la lectura/escritura interna sigue binaria se reintroduciran bugs.

Mitigacion:

- no abrir UI multidioma completa antes de completar Fase 3

## Recomendacion de ritmo

La forma mas segura de hacerlo es:

- siguiente implementacion: Fase 0
- si queda estable: Fase 1
- despues revisar juntos

No recomiendo saltar directamente a la UI final del selector por carta sin desbinarizar primero la capa de preferencias y disponibilidad.