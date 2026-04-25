# Plan de Fiabilidad y Recuperacion de Datos

## Objetivo

Blindar la app frente a perdida de datos de coleccion por corrupcion local, errores de persistencia, importaciones invalidas, cierres inesperados o sincronizaciones defectuosas.

La meta es que el usuario pueda confiar en que sus cantidades, idiomas y progreso no desaparecen ni se sobreescriben silenciosamente.

## Restriccion de alcance

Este plan no busca cambiar la funcionalidad de la app.

La intencion es reforzar la misma experiencia funcional ya existente mediante:

- persistencia mas robusta
- recuperacion mas segura
- mensajes mas claros
- menos riesgo de perdida o sobrescritura

Solo se admiten cambios visibles de UX cuando sirvan para explicar mejor un problema de datos o una recuperacion, sin redefinir el flujo funcional principal.

## Alcance

Este plan cubre:

- persistencia local
- snapshots y recuperacion
- importacion y exportacion
- arranque y validacion de estado
- trazabilidad de fallos delicados
- coordinacion minima con sync cloud

No cubre todavia:

- merge avanzado multidispositivo
- retirada completa de `estado2`
- rediseño de busqueda o completitud

## Situacion actual resumida

### Lo que ya existe

- `estado3` se carga y guarda en localStorage
- `estado2` tiene guardado con debounce y proteccion basica de cuota
- existe exportacion e importacion manual
- existe backup puntual de v2 para migracion a v3
- existe sincronizacion con Supabase y bandera `dirty`

### Debilidades reales del estado actual

- si un estado se corrompe, la app puede reiniciarlo a vacio sin una recuperacion guiada
- no hay snapshots versionados del estado canonico
- el guardado seguro esta mucho mas trabajado para `estado2` que para `estado3`
- importacion y restauracion no funcionan aun como sistema integral de recuperacion
- no hay reporte visible al usuario cuando se recupera un estado o falla una escritura critica
- el arranque carga varios estados y caches, pero sin una orquestacion clara de salud del dato

## Principios del plan

1. Nunca resetear a vacio silenciosamente si existe una alternativa razonable de recuperacion.
2. El estado canonico debe validarse antes de persistirse y despues de cargarse.
3. Todo estado recuperado automaticamente debe quedar trazado y ser visible para el usuario.
4. Los datos derivados y regenerables no deben bloquear la recuperacion del inventario.
5. La recuperacion local debe existir incluso sin nube.

## Arquitectura objetivo

### Fuente canonica de recuperacion

La recuperacion debe girar alrededor de `estado3` como estado principal.

`estado2`, `estado` legacy, caches, progreso derivado, stats snapshot y otros auxiliares deben tratarse segun este orden:

1. inventario canonico y preferencias criticas
2. preferencias auxiliares de UI
3. caches reconstruibles
4. datos derivados regenerables

### Capas de seguridad deseadas

1. estado canonico actual
2. ultimo snapshot valido anterior
3. backup exportable manual
4. copia remota en nube cuando exista sesion

## Fase 1 - Definir contratos de salud y recuperacion

### Objetivo

Congelar que datos son criticos, cuales son reconstruibles y como se decide si un estado es valido o recuperable.

### Trabajo

- clasificar todas las claves persistidas en:
  - criticas
  - importantes pero reconstruibles
  - totalmente derivadas
- definir el payload minimo recuperable para que la coleccion siga siendo util
- definir las reglas de validacion minima para:
  - `estado3`
  - `estado2`
  - `oracleIdCache`
  - progreso por set
  - preferencias UI

### Entregables

- tabla de persistencia por clave
- contrato de payload minimo valido
- reglas de degradacion aceptable por bloque

### Criterio de salida

- queda decidido que puede descartarse y que no puede perderse sin intentar recuperacion

### Tabla tecnica de claves persistidas

La siguiente tabla fija la criticidad operativa de las claves persistidas actuales y la politica inicial recomendada de validacion y recuperacion.

#### Leyenda

- critica: no debe perderse sin intentar recuperacion
- importante: debe conservarse si es posible, pero la app puede seguir funcionando si falla
- derivada: puede regenerarse y no debe bloquear el arranque
- cache: optimiza experiencia o rendimiento, pero no es fuente de verdad funcional

| Clave | Rol actual | Criticidad | Validacion minima | Si falla carga | Si falla guardado |
| --- | --- | --- | --- | --- | --- |
| `mtg_coleccion_estado_v3` | inventario canonico y preferencias v3 | critica | JSON valido + `normalizeEstado3` + estructura minima usable | intentar snapshot previo; si no, arranque degradado visible | aviso critico + no silenciar + conservar ultimo snapshot valido |
| `mtg_coleccion_estado_v3_backup_v2` | backup de migracion desde v2 | importante | JSON objeto | ignorar si esta corrupto | loggear y continuar; no bloquear app |
| `mtg_coleccion_estado_v2` | estado transitorio / compatibilidad | importante mientras exista convivencia | JSON objeto + `getEstadoCarta2` normalizable | ignorar si v3 ya es usable; si no, usar para recuperacion parcial | aviso no critico; registrar fallo |
| `mtg_coleccion_estado_v1` | legacy de compatibilidad | importante baja | JSON objeto | ignorar si v2/v3 son validos | loggear y continuar |
| `mtg_oracle_id_cache_v1` | cache de resolucion de ids | importante reconstruible | JSON objeto | vaciar y reconstruir gradualmente | loggear; no bloquear guardado critico |
| `mtg_set_progress_v1` | progreso guardado por set | derivada | JSON objeto con valores numericos tolerantes | regenerar desde inventario o dejar vacio | ignorar fallo o avisar suave |
| `mtg_stats_snapshot_v1` | snapshot de estadisticas | derivada | JSON objeto | descartar y recalcular | ignorar fallo; recalcular luego |
| `mtg_ui_lang_by_oracle_v1` | preferencias legacy de idioma visible por carta | importante reconstruible | JSON objeto con lang normalizable | reset controlado a defaults | aviso suave o log |
| `mtg_colecciones_filtros_v1` | filtros de colecciones | importante baja | JSON objeto | reset a defaults | ignorar; no bloquear |
| `mtg_card_controls_v1` | configuracion visible de controles | importante baja | JSON objeto + `normalizeCardControlsConfig` | reset a defaults | ignorar o aviso suave |
| `mtg_hidden_empty_sets_v1` | sets ocultos vacios | importante baja | array serializable | reset a conjunto vacio | ignorar o aviso suave |
| `mtg_hidden_collections_v1` | colecciones ocultas | importante baja | array serializable | reset a conjunto vacio | ignorar o aviso suave |
| `mtg_decks_v1` | mazos del usuario | critica secundaria | JSON array | intentar conservar por separado aunque falle otra clave | aviso claro; no mezclar con fallo de inventario |
| `mtg_catalogo_sets_v1` | catalogo cacheado | cache | JSON array u objeto normalizable | descartar y recargar | ignorar; no bloquear |
| `mtg_catalogo_timestamp_v1` | timestamp del catalogo | cache | numero o fecha parseable | ignorar | ignorar |
| `mtg_set_metadata_by_code_v1` | metadata de sets / idiomas | cache importante | JSON objeto | descartar y rehidratar | ignorar; no bloquear |
| `mtg_local_updated_at_v1` | reloj local de sync | importante reconstruible | numero valido | reset conservador | loggear; no bloquear |
| `mtg_image_cache_bytes_v1` | metrica de cache de imagenes | cache | numero >= 0 | reset a 0 | ignorar |
| `mtg-auth-event` | señalizacion de auth | derivada temporal | string/numero | ignorar | ignorar |

### Politica de recuperacion por grupo

#### Grupo A - Inventario y datos de usuario irremplazables

- `mtg_coleccion_estado_v3`
- `mtg_decks_v1`

Politica:

- nunca descartarlos sin intentar recuperacion
- si fallan, elevar mensaje visible
- aislar su recuperacion del resto de caches y derivados

#### Grupo B - Compatibilidad y apoyo estructural

- `mtg_coleccion_estado_v2`
- `mtg_coleccion_estado_v1`
- `mtg_coleccion_estado_v3_backup_v2`
- `mtg_oracle_id_cache_v1`
- `mtg_ui_lang_by_oracle_v1`

Politica:

- aprovecharlos para migracion o restauracion parcial
- si son invalidos, no deben bloquear el arranque si el inventario canonico es sano

#### Grupo C - Preferencias y personalizacion

- `mtg_colecciones_filtros_v1`
- `mtg_card_controls_v1`
- `mtg_hidden_empty_sets_v1`
- `mtg_hidden_collections_v1`

Politica:

- reset seguro a defaults si son invalidos
- informar solo si el fallo es repetido o si afecta claramente a UX

#### Grupo D - Datos derivados y caches

- `mtg_set_progress_v1`
- `mtg_stats_snapshot_v1`
- `mtg_catalogo_sets_v1`
- `mtg_catalogo_timestamp_v1`
- `mtg_set_metadata_by_code_v1`
- `mtg_image_cache_bytes_v1`

Politica:

- nunca bloquear arranque por estas claves
- descartarlas sin drama cuando esten corruptas
- regenerarlas cuando sea posible

### Payload minimo recuperable

La app debe considerarse recuperable aunque falten todos los caches y datos derivados, siempre que exista al menos este nucleo:

```json
{
  "estado3": {
    "version": 3,
    "inventoryByPrintId": {},
    "manualInventoryByCardLang": {},
    "uiPreferences": {}
  }
}
```

Opcionalmente pueden conservarse por separado:

- mazos
- preferencias de controles
- ocultaciones y filtros

### Reglas de degradacion aceptable

#### Degradacion aceptable

- perder stats snapshot
- perder progreso cacheado si puede recalcularse
- perder cache de catalogo o metadata de sets
- resetear filtros y ocultaciones a defaults
- resetear preferencias visibles no canonicas si el inventario sigue intacto

#### Degradacion no aceptable sin intento de recuperacion

- vaciar `estado3`
- vaciar mazos del usuario sin intentar rescate
- aplicar una importacion invalida sobre inventario sano
- dejar que un pull cloud pise un estado local recuperado sin aviso

### Resultado esperado de la Fase 1

Al cerrar esta fase debe quedar totalmente decidido:

- que claves son criticas de verdad
- que validacion minima necesita cada bloque
- que politica de recuperacion aplica en cada caso
- que puede resetearse a defaults sin traicionar al usuario
- que fallos deben subir a UI y cuales pueden quedarse como degradacion silenciosa controlada

## Fase 2 - Guardado seguro de estado canonico

### Objetivo

Dar a `estado3` un mecanismo de persistencia al menos tan robusto como el actual de `estado2`, y mejor orientado a recuperacion.

### Trabajo

- introducir `guardarEstado3Seguro()`
- validar el payload antes de serializar
- capturar y clasificar errores de escritura:
  - cuota excedida
  - seguridad / almacenamiento bloqueado
  - serializacion invalida
  - error desconocido
- definir si `guardarEstado3()` queda como API publica y delega en `guardarEstado3Seguro()`
- valorar debounce configurable para escrituras frecuentes de inventario

### Decisiones tecnicas a cerrar

- si `estado3` debe guardarse con debounce o guardado inmediato por defecto
- si el snapshot se escribe:
  - antes del guardado principal
  - despues del guardado principal
  - o en ambas etapas con marcas distintas

### Entregables

- helper de guardado seguro de v3
- ruta de error con logging normalizado
- mensajes de UI para fallo de persistencia critica

### Criterio de salida

- un fallo de escritura de `estado3` deja rastro claro y no pasa desapercibido

### Especificacion tecnica propuesta

### Objetivo tecnico concreto

Sustituir el guardado directo actual de `estado3` por una ruta de persistencia segura que:

- valide el estado antes de escribir
- pueda devolver resultado estructurado, no solo efecto lateral
- se coordine con snapshots locales
- eleve errores criticos a una capa de UI o logging estructurado

### API propuesta

#### Helper principal

```js
function guardarEstado3Seguro(options = {}) {
  // return {
  //   ok: boolean,
  //   reason: string,
  //   wroteMainState: boolean,
  //   wroteSnapshot: boolean,
  //   bytes: number,
  //   error: Error | null
  // }
}
```

#### API publica mantenida

```js
function guardarEstado3() {
  return guardarEstado3Seguro({
    persistSnapshot: true,
    markDirty: true,
    notifyOnFailure: true
  });
}
```

### Parametros sugeridos

- `persistSnapshot`: si debe escribir snapshot previo o no
- `markDirty`: si debe invocar `sbMarkDirty()` cuando el guardado principal termina bien
- `notifyOnFailure`: si debe emitir mensaje visible
- `debounced`: si la llamada entra por ruta diferida o inmediata
- `reason`: contexto de escritura, por ejemplo:
  - `inventory-write`
  - `ui-preferences-write`
  - `migration-write`
  - `import-write`

### Flujo de guardado recomendado

1. clonar o normalizar `estado3` en memoria
2. aplicar `enforceUiPreferencesIntegrityV3`
3. validar estructura minima
4. serializar a JSON
5. calcular tamaño aproximado
6. si `persistSnapshot` está activo, preparar snapshot previo valido
7. intentar escritura de `mtg_coleccion_estado_v3`
8. si la escritura principal tiene éxito:
   - actualizar metadata si aplica
   - marcar dirty si corresponde
   - registrar evento de éxito si DEBUG o logging estructurado
9. si falla:
   - clasificar error
   - no sobrescribir snapshot sano
   - emitir resultado estructurado
   - opcionalmente elevar aviso visible

### Validacion minima previa a escritura

`guardarEstado3Seguro()` debe considerar invalido cualquier payload que no cumpla al menos:

- `version === 3`
- `inventoryByPrintId` es objeto
- `manualInventoryByCardLang` es objeto
- `uiPreferences` existe y puede normalizarse

No se exige en esta fase:

- coherencia total con catalogo cargado
- que todos los `printId` sean resolubles inmediatamente
- que caches auxiliares existan

### Clasificacion de errores propuesta

- `storage-quota-exceeded`
- `storage-security-blocked`
- `storage-serialize-failed`
- `storage-invalid-state`
- `storage-write-failed-unknown`

### Politica de dirty y efectos laterales

Regla recomendada:

- solo marcar `dirty` si la escritura principal se ha completado correctamente
- no marcar `dirty` si estamos aplicando payload cloud
- no disparar recálculos adicionales desde el guardado seguro; esos flujos deben permanecer donde ya están para no alterar funcionalidad

### Politica de debounce

Recomendacion inicial:

- mantener guardado inmediato para llamadas criticas ya existentes si cambiarlo altera demasiado el comportamiento interno
- introducir una ruta opcional `guardarEstado3Debounced()` solo para escrituras muy frecuentes de UI cuando se confirme que no cambia semántica ni persistencia percibida

Esto mantiene la restriccion principal del proyecto:

- reforzar la fiabilidad sin redefinir el funcionamiento esperado

### Pseudoflujo propuesto

```text
guardarEstado3Seguro(options)
1. normalizar estado3
2. validar payload minimo
3. serializar
4. si serialization falla -> return error estructurado
5. opcional: preparar snapshot previo
6. safeLocalStorageSet(LS_KEY_V3, json)
7. si falla -> clasificar error y devolver resultado
8. si éxito -> persistir metadata ligera si aplica
9. si markDirty -> sbMarkDirty()
10. devolver resultado ok
```

### Decisiones abiertas de Fase 2

1. si el snapshot debe basarse en el estado previo en storage o en el estado previo en memoria
2. si la metadata de guardado debe ir dentro del snapshot o en clave separada
3. si conviene introducir contador de fallos consecutivos de persistencia

### Validacion funcional de Fase 2

1. un estado v3 valido se guarda y devuelve resultado `ok`
2. un estado estructuralmente invalido no se persiste
3. una cuota excedida devuelve error clasificado
4. un fallo de persistencia no vacia ni altera el estado en memoria

## Fase 3 - Snapshots locales versionados

### Objetivo

Conservar automaticamente un ultimo estado sano para recuperacion local inmediata.

### Diseño propuesto

### Claves nuevas sugeridas

- `mtg_coleccion_estado_v3_snapshot_prev`
- `mtg_coleccion_estado_v3_snapshot_meta`

### Contenido minimo de snapshot

```json
{
  "schemaVersion": 3,
  "savedAt": "2026-04-23T12:00:00.000Z",
  "reason": "pre-write-backup",
  "inventoryEntries": 1234,
  "uiPreferenceEntries": 56,
  "estado3": {}
}
```

### Politica inicial recomendada

- conservar un snapshot anterior valido, no una rotacion compleja todavia
- actualizar snapshot solo cuando el nuevo estado haya pasado validacion estructural minima
- no snapshotear caches grandes o datos regenerables junto al inventario canonico

### Trabajo

- crear helpers:
  - `buildEstado3Snapshot()`
  - `guardarEstado3SnapshotPrev()`
  - `cargarEstado3SnapshotPrev()`
  - `validarEstado3Snapshot()`
- decidir umbrales de snapshot para no escribir en exceso

### Criterio de salida

- siempre que la app haya guardado correctamente al menos una vez, existe una segunda oportunidad local de recuperacion

### Especificacion tecnica propuesta

### Objetivo tecnico concreto

Crear una segunda copia local sana del estado canonico anterior para que una corrupcion o escritura defectuosa no deje al usuario sin recuperación inmediata.

### Estrategia inicial recomendada

Implementar un único snapshot previo estable, no una rotación larga ni journaling.

Esto mantiene la solución:

- simple de razonar
- barata en almacenamiento
- alineada con la restricción de no complejizar funcionalidad visible

### Claves propuestas

- `mtg_coleccion_estado_v3_snapshot_prev`
- `mtg_coleccion_estado_v3_snapshot_meta`

### Estructura recomendada del snapshot

```json
{
  "schemaVersion": 3,
  "snapshotVersion": 1,
  "savedAt": "2026-04-23T12:00:00.000Z",
  "source": "pre-main-write",
  "inventoryEntries": 1234,
  "manualInventoryEntries": 12,
  "uiPreferenceSets": 45,
  "estado3": {}
}
```

### Metadata separada opcional

```json
{
  "lastSnapshotAt": "2026-04-23T12:00:00.000Z",
  "lastSnapshotReason": "inventory-write",
  "lastRestoreAt": null,
  "lastRestoreSource": null
}
```

### Politica de escritura de snapshot

Regla recomendada para la primera iteracion:

- el snapshot se escribe a partir del ultimo estado principal valido antes de sobrescribirlo
- no se genera snapshot de un estado ya invalido o no parseable
- si el estado principal no existe aun, no se fuerza snapshot vacio

### Fuente del snapshot

Orden recomendado:

1. leer `mtg_coleccion_estado_v3` actual desde storage
2. validarlo y normalizarlo
3. si es valido, convertirlo en snapshot previo
4. solo entonces intentar escribir el nuevo estado principal

Esto reduce el riesgo de guardar como snapshot un estado en memoria todavía no persistido correctamente.

### Helpers propuestos

```js
function buildEstado3Snapshot(estado3Value, options = {}) {}
function validarEstado3Snapshot(snapshot) {}
function guardarEstado3SnapshotPrev(snapshot) {}
function cargarEstado3SnapshotPrev() {}
function restaurarEstado3DesdeSnapshot(snapshot, options = {}) {}
```

### Reglas de validez del snapshot

Un snapshot debe considerarse utilizable solo si:

- `schemaVersion === 3`
- `savedAt` es parseable
- `estado3` existe y pasa validacion minima de v3

Debe considerarse inutilizable si:

- falta `estado3`
- `estado3` no se puede normalizar
- el JSON es corrupto

### Politica de restauracion

`restaurarEstado3DesdeSnapshot()` debe:

1. validar snapshot
2. restaurar `estado3` en memoria
3. persistirlo como estado principal solo si pasa validacion minima
4. registrar metadata de restauracion
5. devolver resultado estructurado

### Resultado estructurado sugerido

```js
{
  ok: true,
  restored: true,
  source: "snapshot-prev",
  savedAt: "...",
  inventoryEntries: 1234,
  error: null
}
```

### Integracion con arranque

La Fase 3 prepara la base para la Fase 4, pero deja ya definido este contrato:

- si `cargarEstado3()` falla, el arranque no debe resetear a vacio sin consultar el snapshot previo

### Politica de limpieza

No borrar automaticamente snapshots al primer arranque correcto.

Recomendacion:

- conservar el snapshot previo hasta que un nuevo snapshot valido lo reemplace

### Riesgos tecnicos previstos

1. duplicar demasiado almacenamiento local

Mitigacion:

- solo un snapshot previo
- sin caches ni derivados dentro

2. snapshot obsoleto pero aun util

Mitigacion:

- mostrar fecha de snapshot cuando se restaure

3. fallo al escribir snapshot pero éxito al escribir estado principal

Mitigacion:

- no bloquear el guardado principal por eso
- devolver `wroteMainState=true`, `wroteSnapshot=false`

### Pseudoflujo de snapshot propuesto

```text
antes de escribir estado3 nuevo:
1. leer estado3 actual desde storage
2. si existe y es valido -> build snapshot
3. intentar guardar snapshot previo
4. intentar guardar estado3 nuevo
5. devolver si se escribio principal y si se escribio snapshot
```

### Validacion funcional de Fase 3

1. si existe estado3 previo valido, se genera snapshot antes de sobrescribir
2. si no existe estado3 previo, no se crea snapshot basura
3. si snapshot falla pero guardado principal funciona, la app no se rompe
4. si estado principal queda corrupto y snapshot es valido, hay material para recuperar

## Fase 4 - Arranque con recuperacion asistida

### Objetivo

Evitar que el arranque convierta un problema recuperable en una perdida silenciosa de coleccion.

### Flujo objetivo de arranque

1. intentar cargar `estado3`
2. validar estructura minima
3. si falla:
   - intentar snapshot previo
4. si snapshot previo es valido:
   - restaurarlo en memoria
   - marcar evento de recuperacion
   - avisar en UI
5. si no hay snapshot valido:
   - intentar import de respaldo local si existe
   - si no existe, arrancar degradado y avisar claramente

### Trabajo

- extraer una rutina tipo `bootLoadPersistentState()`
- centralizar resultado del arranque en un objeto de salud
- separar:
  - estado recuperado automaticamente
  - estado arrancado en degradado
  - fallo critico sin recuperacion

### Entregables

- orquestador de arranque de persistencia
- estado de salud del arranque
- mensaje visible y no intrusivo para recuperaciones

### Criterio de salida

- el usuario sabe si la app ha recuperado datos o si esta en modo degradado

### Especificacion tecnica propuesta

### Objetivo tecnico concreto

Sustituir el arranque secuencial y silencioso actual por un flujo orquestado de carga de persistencia que:

- determine la salud del dato antes de seguir
- intente recuperacion local si el estado canonico falla
- no marque como normal un arranque degradado
- no se contradiga con la sync cloud posterior

### API propuesta

#### Orquestador principal

```js
async function bootLoadPersistentState() {
  // return {
  //   ok: boolean,
  //   bootMode: "normal" | "recovered-local" | "degraded" | "fatal",
  //   source: "estado3" | "snapshot-prev" | "estado2-partial" | "empty-default",
  //   recovered: boolean,
  //   degradedBlocks: string[],
  //   notices: [],
  //   error: Error | null
  // }
}
```

#### Helpers sugeridos

```js
function cargarEstado3ConSalud() {}
function cargarSnapshotEstado3ConSalud() {}
function cargarPersistenciaSecundariaConSalud() {}
function applyBootStateHealth(result) {}
```

### Objeto de salud de arranque

Propuesta minima:

```js
{
  ok: true,
  bootMode: "normal",
  source: "estado3",
  recovered: false,
  degradedBlocks: [],
  notices: [
    {
      level: "info" | "warning" | "error",
      code: "snapshot-restored",
      message: "Se ha recuperado tu colección desde una copia local reciente."
    }
  ],
  error: null
}
```

### Flujo objetivo de arranque

#### Paso 1 - Carga del nucleo canonico

- intentar leer `mtg_coleccion_estado_v3`
- validarlo con la regla minima de Fase 1

Resultados posibles:

- valido -> continuar en modo `normal`
- corrupto o invalido -> pasar a Paso 2
- ausente -> pasar a Paso 3

#### Paso 2 - Recuperacion desde snapshot previo

- leer `mtg_coleccion_estado_v3_snapshot_prev`
- validarlo
- si es valido:
  - restaurar en memoria
  - marcar `bootMode = recovered-local`
  - añadir notice `snapshot-restored`
  - persistir opcionalmente como estado principal solo si la restauracion se confirma valida
- si no es valido:
  - pasar a Paso 3

#### Paso 3 - Compatibilidad y degradacion controlada

- intentar cargar `estado2` y soportes de compatibilidad solo si no existe v3 usable
- si `estado2` es utilizable:
  - permitir arranque degradado con notice claro
  - marcar `source = estado2-partial`
- si tampoco existe una base suficiente:
  - arrancar con `empty-default` y `bootMode = degraded`
  - mostrar mensaje visible de ausencia de datos recuperables

#### Paso 4 - Carga de persistencia secundaria

Una vez decidido el inventario base:

- cargar decks
- cargar preferencias UI y controles
- cargar ocultaciones y filtros
- cargar caches y derivados

Cada uno debe degradarse independientemente segun la tabla de Fase 1.

#### Paso 5 - Aplicacion de salud al arranque visible

- si `bootMode = normal`, no molestar al usuario
- si `bootMode = recovered-local`, mostrar mensaje informativo no intrusivo
- si `bootMode = degraded`, mostrar advertencia clara
- si `bootMode = fatal`, bloquear flujo normal y ofrecer exportacion o recuperacion si hay alguna ruta disponible

### Politica de canales de mensaje

Sin introducir una nueva funcionalidad visible compleja, se recomienda reutilizar mecanismos ya presentes:

- `syncStatus` para avisos breves persistentes en zona de sincronizacion
- `msgBackup` para mensajes ligados a import/export o recuperacion manual
- banner liviano reutilizable si el aviso debe permanecer hasta que el usuario lo vea

Regla de UX:

- no usar `alert()` para recuperaciones normales
- reservar bloqueos o confirmaciones para fallos realmente criticos

### Politica de prioridad local vs cloud

#### Regla principal

La recuperacion local debe resolverse antes de aplicar cualquier payload cloud.

#### Politica inicial recomendada

1. arranque local primero
2. si el arranque ha sido `recovered-local`, registrar un flag de sesion tipo:
   - `bootRecoveryPendingConfirmation = true`
3. mientras ese flag exista:
   - un `sbPullNow()` no debe pisar automaticamente el estado local recuperado
   - debe pedir accion explicita o dejar aviso de que la nube contiene otro estado

#### Casos a distinguir

- `normal + cloud available`
  - comportamiento actual casi intacto
- `recovered-local + cloud available`
  - no auto-aplicar cloud sin aviso
- `degraded + cloud available`
  - la cloud puede ofrecer salida, pero la app debe explicarlo como recuperacion alternativa, no como carga silenciosa

### Integracion sugerida con `init()`

En lugar de cargar persistencia critica de forma dispersa:

```text
init()
1. applyTheme()
2. const bootState = await bootLoadPersistentState()
3. applyBootStateHealth(bootState)
4. cargar UI no critica y wiring
5. iniciar Supabase con conocimiento del bootState
6. seguir con catalogo y render
```

### Invariantes de Fase 4

- un estado corrupto no debe terminar en reset silencioso a vacio
- un snapshot restaurado debe quedar comunicado al usuario
- la sync cloud no debe borrar una recuperacion local sin aviso
- caches invalidos no deben degradar el estado del inventario recuperado

### Resultado estructurado de restauracion sugerido

```js
{
  ok: true,
  bootMode: "recovered-local",
  source: "snapshot-prev",
  recovered: true,
  degradedBlocks: ["statsSnapshot", "setProgress"],
  notices: [
    {
      level: "warning",
      code: "snapshot-restored",
      message: "Se ha recuperado tu colección desde una copia local reciente."
    }
  ],
  error: null
}
```

### Casos de validacion funcional de Fase 4

1. `estado3` sano -> arranque `normal`
2. `estado3` corrupto + snapshot valido -> arranque `recovered-local`
3. `estado3` corrupto + snapshot invalido + `estado2` util -> arranque `degraded` con soporte parcial
4. sin estados utiles -> arranque `degraded` visible y no silencioso
5. arranque `recovered-local` + cloud mas nueva -> no aplicar cloud automaticamente
6. fallo en filtros, caches o stats -> arranque normal si el inventario es sano

### Riesgos tecnicos previstos

1. arranque mas complejo y mas largo

Mitigacion:

- separar persistencia critica de cargas no criticas
- no bloquear catalogo o limpieza de caches por la orquestacion de salud

2. mezclar recuperacion local con sincronizacion de nube demasiado pronto

Mitigacion:

- flag de sesion para recuperacion pendiente
- no ejecutar auto-pull destructivo tras un recovery local

3. exceso de mensajes al usuario

Mitigacion:

- mensajes solo para `recovered-local` o `degraded`
- silencio en arranque `normal`

## Fase 5 - Importacion y exportacion como sistema de recuperacion

### Objetivo

Elevar el backup manual de utilidad secundaria a sistema serio de seguridad.

### Trabajo

- enriquecer `exportarEstado()` con metadatos de integridad
- hacer que `validarPayloadImport()` reporte mas detalle:
  - version
  - compatibilidad
  - bloques ignorados
  - bloques invalidos
- permitir importacion segura con simulacion previa de validacion
- definir si la importacion:
  - sustituye todo
  - sustituye solo inventario
  - importa parcialmente ciertos bloques

### Mejora recomendada

- mostrar un resumen antes de aplicar una importacion:
  - fecha del backup
  - volumen de inventario
  - version del esquema
  - si contiene v3, v2 o ambos

### Criterio de salida

- el usuario puede usar export/import con confianza real en caso de emergencia o migracion

## Fase 6 - Observabilidad y mensajes de error

### Objetivo

Sacar del limbo de consola los problemas delicados de datos.

### Trabajo

- normalizar eventos de datos con categorias como:
  - `storage-write-failed`
  - `storage-load-corrupt`
  - `snapshot-restored`
  - `import-validation-failed`
  - `cloud-payload-applied`
- registrar resumen acotado en memoria local o session note si procede
- crear mensajes de UI claros para:
  - recuperacion automatica exitosa
  - fallo de persistencia local
  - importacion invalida
  - nube mas nueva que local

### Criterio de salida

- un fallo grave de datos deja de depender de abrir DevTools para detectarse

## Fase 7 - Coordinacion minima con sync cloud

### Objetivo

Evitar que la recuperacion local y la sync remota se contradigan.

### Trabajo

- decidir prioridad temporal entre:
  - estado local recuperado
  - estado cloud descargado
  - estado local dirty no subido
- definir politica inicial recomendada:
  - el arranque recupera local primero
  - la descarga cloud no debe pisar automaticamente un estado local recuperado y aun no confirmado
- marcar visualmente cuando el estado activo viene de recuperacion local pendiente de confirmacion

### Criterio de salida

- no existe un flujo en el que la app recupere localmente y acto seguido pise esa recuperacion con la nube sin avisar

## Tabla de prioridades

### Prioridad critica

- Fase 1
- Fase 2
- Fase 3
- Fase 4

### Prioridad alta

- Fase 5
- Fase 7

### Prioridad media

- Fase 6

## Riesgos y decisiones abiertas

### Riesgo 1 - Aumento de escrituras en localStorage

Mitigacion:

- debounce o thresholds
- snapshot solo ante cambios sustanciales o al cerrar lote de escritura

### Riesgo 2 - Estado parcialmente valido

Mitigacion:

- validar por bloques y degradar solo lo reconstruible
- no exigir que caches o stats sean sanos para aceptar inventario

### Riesgo 3 - Recuperar un snapshot ya obsoleto

Mitigacion:

- mostrar fecha de recuperacion
- permitir exportar inmediatamente tras recuperacion
- evitar que la nube lo pise sin confirmacion

### Riesgo 4 - Complejidad excesiva demasiado pronto

Mitigacion:

- empezar por un unico snapshot previo
- no introducir historial largo ni journal completo en esta fase

## Checklist de implementacion

1. congelar contrato de salud del dato
2. crear guardado seguro de `estado3`
3. crear snapshot previo versionado
4. centralizar arranque y recuperacion
5. reforzar import/export
6. añadir mensajes de UI y logging estructurado
7. coordinar recuperacion con sync cloud

## Validacion funcional minima

### Casos obligatorios

1. `estado3` valido arranca normal
2. `estado3` corrupto recupera snapshot previo
3. `estado3` corrupto sin snapshot muestra arranque degradado claro
4. fallo de quota al guardar deja aviso y no silencio
5. importacion invalida no pisa el estado actual
6. importacion valida deja backup previo antes de aplicar
7. recuperacion local no es pisada automaticamente por pull cloud sin aviso

## Resultado esperado

Al cerrar este plan, la app debe haber dado un salto claro de confianza percibida.

El usuario debe notar tres cosas:

- sus datos no desaparecen facilmente
- si hay un problema, la app se lo explica
- existe una ruta real de recuperacion local y manual

## Siguiente subplan recomendado

Despues de este bloque, el siguiente a desarrollar con detalle debe ser el cierre operativo de inventario v3.

La razon es simple: de poco sirve recuperar bien si la fuente de verdad del inventario sigue repartida entre capas transitorias.