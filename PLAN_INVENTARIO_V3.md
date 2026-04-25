# Plan Inventario V3

## Objetivo de la Fase 1

Definir un modelo de inventario escalable para idiomas múltiples que:

- use inglés como base canónica de catálogo y fallback
- permita añadir idiomas sin cambiar la estructura del estado
- separe visualización de idioma y posesión real
- impida que unidades de distintos idiomas se pisen entre sí
- sea compatible con una migración progresiva desde el estado actual

## Hallazgos del modelo actual

### Lo que ya está bien

- La clave de inventario actual ya intenta usar el print de Scryfall antes que el `oracle_id` en [app.js](app.js#L1697).
- El catálogo ya conserva `id`, `oracle_id`, `lang`, `collector_number` y `setKey`, que son suficientes para construir un modelo más sólido.
- El catálogo ya tiene noción de idiomas disponibles por set y usa Scryfall más MTGJSON para enriquecer metadatos.

### Lo que está rompiendo la escalabilidad

- El valor del estado sigue rígido a dos idiomas: `qty_en`, `qty_es`, `foil_en`, `foil_es`, etc. en [app.js](app.js#L2278).
- El sistema mezcla idioma visual con idioma de inventario en flujos como `adjustTotalQty` en [app.js](app.js#L2485).
- La nomenclatura actual induce error: muchas funciones llaman `oracle_id` a una clave que en la práctica suele ser `print_id`.
- Añadir un idioma nuevo hoy obligaría a añadir nuevas columnas en todo el sistema.

## Principios de diseño v3

1. La posesión vive en la impresión concreta.
2. La carta lógica vive en `oracle_id`.
3. La UI puede agrupar por carta lógica, pero nunca comparte inventario entre prints.
4. Los totales agregados se calculan; no se almacenan duplicados por idioma.
5. El modelo de datos no conoce una lista cerrada de idiomas.
6. El idioma de visualización nunca decide dónde se guardan unidades por sí mismo.

## Entidades del modelo v3

### 1. Print

Representa una impresión concreta de Scryfall.

Clave primaria:

- `printId`: `card.id` de Scryfall

Campos mínimos:

- `printId`
- `oracleId`
- `setCode`
- `collectorNumber`
- `lang`
- `name`
- `nameEn`
- `imageUrl`
- `releasedAt`

### 2. Carta lógica

Representa la carta abstracta.

Clave primaria:

- `oracleId`

Uso:

- agrupar variantes
- búsquedas globales
- navegación entre idiomas y reimpresiones
- cálculos agregados por carta

### 3. Inventario

Representa la posesión real del usuario sobre una impresión concreta.

Clave primaria:

- `printId`

Valor:

```json
{
  "qty": 0,
  "foil": 0,
  "ri": false,
  "counters": {},
  "tags": {},
  "updatedAt": 0
}
```

Notas:

- `qty` y `foil` son totales del print, no por idioma.
- `foil <= qty` siempre.
- Si un print es `lang:es`, toda su posesión pertenece a español por definición.

### 4. Preferencias de UI

Separadas del inventario.

Propuesta:

```json
{
  "display": {
    "globalFallbackLang": "en",
    "preferredSetLang": {
      "khm": "es",
      "woe": "en"
    },
    "selectedVariantByCard": {
      "khm::oracle-123": "print-abc"
    }
  }
}
```

## Estado persistente v3

Nueva clave de almacenamiento propuesta:

- `mtg_coleccion_estado_v3`

Estructura:

```json
{
  "version": 3,
  "inventoryByPrintId": {
    "print-1": {
      "qty": 2,
      "foil": 1,
      "ri": false,
      "counters": {},
      "tags": {},
      "updatedAt": 1742515200000
    }
  },
  "uiPreferences": {
    "globalFallbackLang": "en",
    "preferredSetLang": {},
    "selectedVariantByCard": {}
  }
}
```

## Índices necesarios

Los índices pueden ser reconstruibles en memoria y no necesitan persistirse obligatoriamente.

### Índices mínimos

1. `printsByOracleId`

- `oracleId -> printId[]`

2. `printsBySetCode`

- `setCode -> printId[]`

3. `variantPrintsBySetCard`

- clave lógica: `setCode::oracleId::collectorNumber`
- valor: `printId[]`

4. `printMetaById`

- `printId -> printMeta`

### Propósito

- localizar variantes de idioma dentro de un mismo set
- calcular totales agregados por carta
- renderizar un selector de variantes sin reconsultar datos
- hacer migraciones deterministas desde v2

## Reglas de integridad

Estas reglas son obligatorias desde v3.

1. Una unidad siempre pertenece a un único `printId`.
2. Nunca se redistribuyen unidades entre idiomas por cambiar la UI.
3. `foil` no puede ser mayor que `qty`.
4. Si `qty` pasa a `0`, `foil` debe pasar a `0`.
5. Los totales por carta se calculan como suma de `inventoryByPrintId` sobre los prints agregados.
6. Los contadores y tags viven en el print poseído, no en el idioma visual.

## Compatibilidad hacia atrás

### Estado actual

El estado actual v2 mezcla:

- una clave que suele ser `printId`
- un valor rígido con columnas por idioma

Ejemplo actual:

```json
{
  "print-1": {
    "qty_en": 2,
    "qty_es": 1,
    "foil_en": 1,
    "foil_es": 0,
    "ri_en": false,
    "ri_es": true,
    "counters_en": {},
    "counters_es": {},
    "tags_en": {},
    "tags_es": {}
  }
}
```

### Interpretación correcta para migración

El hecho de que la clave ya sea normalmente `printId` permite una migración más controlada:

- `qty_en` solo puede migrar directamente al mismo `printId` si ese print es `lang:en`
- `qty_es` solo puede migrar directamente al mismo `printId` si ese print es `lang:es`
- si el `printId` actual no coincide con el idioma de la columna, habrá que buscar la variante correcta en el mismo set y collector number

Esto convierte la migración en una reasignación de columnas a prints reales, no en una simple copia de campos.

## API objetivo de capa de datos

Estas funciones son la base a implementar en la Fase 2.

### Lectura

- `getInventoryEntry(printId)`
- `getInventoryQty(printId)`
- `getInventoryAggregateForOracle(oracleId, filters)`
- `getVariantPrintsForSetCard(setCode, oracleId, collectorNumber)`
- `getPreferredVariantPrintId(setCode, oracleId, collectorNumber)`

### Escritura

- `setInventoryQty(printId, qty)`
- `setInventoryFoil(printId, foil)`
- `setInventoryTag(printId, key, value)`
- `setInventoryCounter(printId, key, value)`
- `setInventoryRi(printId, value)`

### UI

- `setPreferredSetLang(setCode, lang)`
- `setSelectedVariantForCard(setCode, oracleId, printId)`
- `resolveDisplayPrint(setCode, oracleId, fallbackLang)`

## Qué queda explícitamente fuera de la Fase 1

La Fase 1 no cambia todavía:

- la UI del set
- la exportación/importación actual
- los flujos de deck
- la búsqueda por nombre
- el cálculo de progreso

Solo deja decidido el contrato del nuevo modelo para que la Fase 2 se implemente sin ambigüedad.

## Resultado esperado de la Fase 1

Al terminar esta fase debe quedar claro que:

- el inventario v3 vive por `printId`
- el agrupado y la navegación viven por `oracleId`
- inglés es idioma base de catálogo y fallback, no depósito de inventario por defecto
- la UI cambiará variantes visibles, no moverá unidades entre idiomas
- añadir un idioma nuevo no requerirá tocar la estructura del estado

## Siguiente fase

Fase 2: diseñar la migración desde `estado2` a `estado3`.

## Objetivo de la Fase 2

Definir una migración determinista, idempotente y sin pérdida silenciosa de datos desde `estado2` hacia `estado3`, incluyendo:

- resolución de cada bucket por idioma a un `printId` real
- reglas explícitas para casos ambiguos o incompletos
- formato de importación/exportación con `version: 3`
- coexistencia temporal entre v2 y v3 durante el despliegue

## Entradas reales disponibles para migrar

La migración puede apoyarse únicamente en datos ya existentes o reconstruibles:

1. `estado2`

- clave actual: `stateKey`
- valor actual: `qty_en`, `qty_es`, `foil_en`, `foil_es`, `ri_en`, `ri_es`, `counters_en`, `counters_es`, `tags_en`, `tags_es`

2. `oracleIdCache`

- mapa `id -> { oracle_id, lang }`
- útil para distinguir cuándo una clave antigua era un print concreto y cuándo requiere resolución adicional

3. Catálogo cargado en memoria e IndexedDB

- cada print ya trae `id`, `oracle_id`, `lang`, `collector_number`, `setKey` y nombre
- permite reconstruir índices de variantes por carta y por set

4. Estado legacy v1

- solo se usa como red de seguridad durante importaciones antiguas
- la ruta principal de la Fase 2 parte de `estado2`

## Estado objetivo de salida

La salida persistente de la migración será:

```json
{
  "version": 3,
  "inventoryByPrintId": {},
  "uiPreferences": {
    "globalFallbackLang": "en",
    "preferredSetLang": {},
    "selectedVariantByCard": {}
  },
  "migrationMeta": {
    "migratedFromVersion": 2,
    "migratedAt": "2026-03-21T00:00:00.000Z",
    "unresolvedBuckets": [],
    "sourceStateKeys": 0
  }
}
```

### Notas sobre `migrationMeta`

- `unresolvedBuckets` existe para no perder datos cuando una columna no pueda asignarse con certeza a un print.
- No forma parte del modelo conceptual de inventario, pero sí del contrato de migración.
- Puede eliminarse en una fase posterior cuando el sistema deje de convivir con v2.

## Nuevas claves de almacenamiento

- `mtg_coleccion_estado_v3`
- `mtg_coleccion_estado_v3_backup_v2`

### Propósito

- `mtg_coleccion_estado_v3`: estado canónico nuevo
- `mtg_coleccion_estado_v3_backup_v2`: copia exacta del `estado2` origen usada para rollback e importaciones seguras

## Normalización previa a la migración

Antes de convertir a v3, cada entrada de `estado2` debe pasar por una normalización obligatoria:

1. Normalizar la clave `stateKey` a string limpia.
2. Normalizar la entrada con la misma lógica de `normalizarEstadoCarta2`.
3. Descartar buckets vacíos por idioma.
4. Separar la entrada en dos unidades migrables independientes: bucket `en` y bucket `es`.

Ejemplo de salida intermedia:

```json
[
  {
    "sourceStateKey": "print-abc",
    "sourceLang": "en",
    "qty": 2,
    "foil": 1,
    "ri": false,
    "counters": {},
    "tags": {}
  },
  {
    "sourceStateKey": "print-abc",
    "sourceLang": "es",
    "qty": 1,
    "foil": 0,
    "ri": true,
    "counters": {},
    "tags": {}
  }
]
```

## Índices mínimos para resolver la migración

Además de los índices de Fase 1, la migración necesita estos resolutores en memoria:

1. `printMetaById`

- `printId -> { printId, oracleId, setCode, collectorNumber, lang, releasedAt }`

2. `printsByOracleIdAndLang`

- clave: `oracleId::lang`
- valor: `printId[]`

3. `printsBySetCollectorLang`

- clave: `setCode::collectorNumber::lang`
- valor: `printId[]`

4. `printsByOracleSetCollectorLang`

- clave: `oracleId::setCode::collectorNumber::lang`
- valor: `printId[]`

5. `canonicalPrintByOracleLang`

- clave: `oracleId::lang`
- valor: `printId`

### Regla para `canonicalPrintByOracleLang`

Cuando haya varias opciones posibles para una carta lógica y un idioma, el print canónico se elige con este orden estable:

1. `releasedAt` más antigua
2. `setCode` ascendente
3. `collectorNumber` ascendente con comparación numérica cuando aplique
4. `printId` ascendente

Esta regla no pretende reflejar preferencia del usuario, solo asegurar determinismo en casos inherentemente ambiguos.

## Resolución de cada bucket hacia un print real

Cada bucket migrable se resuelve con el siguiente algoritmo, en este orden y sin saltos:

### Paso 1. Match directo por print conocido

Si `sourceStateKey` existe en `printMetaById` y el `lang` del print coincide con `sourceLang`:

- destino = `sourceStateKey`
- resolución = `direct-print-match`

### Paso 2. Match por print hermano en mismo set y mismo collector number

Si `sourceStateKey` existe en `printMetaById`, pero su `lang` no coincide con `sourceLang`:

- leer `oracleId`, `setCode` y `collectorNumber` del print origen
- buscar en `printsByOracleSetCollectorLang` usando `oracleId::setCode::collectorNumber::sourceLang`

Si hay un único match:

- destino = print encontrado
- resolución = `same-set-same-collector-sibling-lang`

Si hay varios matches:

- elegir el primero por orden estable de `printId`
- registrar la condición como `ambiguous-but-deterministic`

### Paso 3. Match por cache de resolución

Si `sourceStateKey` no existe en `printMetaById`, pero sí en `oracleIdCache`:

- obtener `oracleId` desde cache
- si `oracleIdCache[sourceStateKey].lang === sourceLang` y el print existe en catálogo, usar ese print
- si no coincide el idioma, seguir al paso 4

### Paso 4. Match canónico por `oracleId + lang`

Si ya conocemos `oracleId`, pero no tenemos set y collector fiables:

- buscar `canonicalPrintByOracleLang[oracleId::sourceLang]`

Si existe:

- destino = print canónico
- resolución = `canonical-oracle-lang-fallback`

Este paso se usa solo cuando el estado origen ya era ambiguo y no permite reconstruir set o collector number con seguridad.

### Paso 5. Bucket no resoluble

Si no hay ningún destino determinista:

- no inventar un print
- no mover unidades a otro idioma
- registrar el bucket completo en `migrationMeta.unresolvedBuckets`

Estructura propuesta:

```json
{
  "sourceStateKey": "legacy-key",
  "sourceLang": "es",
  "oracleId": "oracle-123",
  "qty": 2,
  "foil": 1,
  "ri": false,
  "counters": {},
  "tags": {},
  "reason": "no-print-found-for-lang"
}
```

## Reglas de merge al escribir en `inventoryByPrintId`

La migración puede terminar asignando varios buckets al mismo `printId`. Cuando ocurra, el merge será:

1. `qty`

- suma acumulada

2. `foil`

- suma acumulada
- tras el merge, `foil = min(foil, qty)`

3. `ri`

- OR lógico

4. `counters`

- suma por clave

5. `tags`

- OR lógico por clave

6. `updatedAt`

- timestamp único de migración para la entrada resultante

### Regla de seguridad

Si después del merge `qty === 0`:

- `foil = 0`

## Casos especiales que deben quedar fijados

### 1. Estado key que ya es `oracleId`

Si la clave no es un print real pero sí corresponde a una carta lógica:

- la entrada ya era ambigua en v2
- cada bucket se asigna al `canonicalPrintByOracleLang`
- la resolución se marca como `oracle-level-legacy-fallback`

### 2. Print inglés con bucket español, o viceversa

No se debe conservar en el print origen.

- primero se intenta encontrar el print hermano correcto
- si no existe, se pasa al fallback canónico del mismo idioma
- si tampoco existe, se registra como no resuelto

### 3. Variante de idioma inexistente en el catálogo

Ejemplo: un print solo existe en inglés, pero el bucket `qty_es` tiene valor.

Regla:

- no migrar a inglés por conveniencia
- registrar en `unresolvedBuckets` con razón `missing-language-variant`

### 4. Claves de contadores y tags desconocidas

No se descartan.

- se migran tal cual al print resuelto
- la validación del catálogo de controles queda para una fase posterior

## Algoritmo completo de migración

Pseudoflujo:

```text
1. Cargar estado2 y oracleIdCache.
2. Construir índices de prints desde memoria + IndexedDB.
3. Crear copia exacta de seguridad en mtg_coleccion_estado_v3_backup_v2.
4. Para cada stateKey de estado2:
5.   Normalizar entrada.
6.   Extraer bucket en y/o es.
7.   Resolver destino printId para cada bucket.
8.   Si hay destino, mergear en inventoryByPrintId.
9.   Si no hay destino, registrar bucket en unresolvedBuckets.
10. Construir uiPreferences iniciales.
11. Persistir estado3 con version 3.
12. No borrar estado2 durante la fase de coexistencia.
```

## Inicialización de `uiPreferences` durante la migración

La migración no debe inventar preferencias complejas. Estado inicial recomendado:

```json
{
  "globalFallbackLang": "en",
  "preferredSetLang": {},
  "selectedVariantByCard": {}
}
```

### Excepción útil

Si en una colección concreta solo hay un idioma cargado y ese idioma no es inglés, se puede precargar `preferredSetLang[setCode]` con ese idioma. Si esta regla complica la implementación, se omite en la primera entrega.

## Exportación e importación en v3

## Exportación

El payload de backup pasará a `version: 3` y debe incluir:

```json
{
  "app": "MTG Colecciones",
  "version": 3,
  "exportedAt": "2026-03-21T00:00:00.000Z",
  "estado3": {},
  "estado2Backup": {},
  "oracleIdCache": {},
  "cardControlsConfig": {}
}
```

### Criterio

- `estado3` es la fuente principal a restaurar.
- `estado2Backup` se incluye mientras exista coexistencia con migración reciente.

## Importación

1. Si el payload es `version: 3` y trae `estado3`, cargar directamente.
2. Si el payload es `version: 2`, importar `estado2`, luego migrar a v3.
3. Si el payload solo trae `estado` legacy, normalizar a v2 y después migrar a v3.

## Coexistencia temporal entre v2 y v3

Durante el despliegue inicial, la aplicación debe seguir esta prioridad:

1. Si existe `mtg_coleccion_estado_v3`, usar v3.
2. Si no existe v3 pero sí v2, migrar y crear v3.
3. Si no existe v2 pero sí v1, migrar a v2 y luego a v3.

### Reglas de coexistencia

- v2 no se sobrescribe una vez generado el backup de migración.
- los nuevos cambios de inventario se escriben solo en v3.
- los cálculos de estadísticas y progreso deben seguir aceptando v2 únicamente como fallback temporal.

## Idempotencia

La migración debe ser segura de ejecutar varias veces sobre el mismo origen.

Requisitos:

1. Partir siempre de `estado2Backup` o de una copia congelada de `estado2`.
2. No migrar incrementalmente sobre un `estado3` ya migrado.
3. Reemplazar por completo `inventoryByPrintId` al recalcular la migración.

## Resultado esperado de la Fase 2

Al terminar esta fase debe quedar decidido sin ambigüedad:

- cómo se resuelve cada bucket `en` y `es`
- qué hacer cuando no existe la variante correcta
- cómo mezclar varias fuentes sobre un mismo print
- qué formato tendrá backup/import con `version: 3`
- cómo convivir temporalmente con v2 sin pérdida de datos