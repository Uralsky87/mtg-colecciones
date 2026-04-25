# Paquete 1 - Resultado Estructurado de Persistencia

## Objetivo

Introducir una capa minima y reutilizable de resultados estructurados para operaciones de persistencia, sin cambiar todavia el comportamiento funcional de guardado de la app.

Este paquete existe para preparar el terreno a:

- `guardarEstado3Seguro()`
- snapshots locales
- restauracion desde snapshot
- boot state health

## Restriccion de alcance

En este paquete no se debe:

- cambiar como guarda hoy la app
- cambiar el flujo de usuario
- redirigir aun `guardarEstado3()`
- introducir mensajes nuevos en UI
- tocar sincronizacion cloud

El paquete debe ser puramente preparatorio.

## Anclas reales en el codigo actual

### Helpers actuales

- `safeLocalStorageGet(...)`
- `safeLocalStorageSet(...)`
- `safeLocalStorageRemove(...)`

### Persistencia que se apoyara despues en este contrato

- `guardarEstado3()`
- `guardarEstado3BackupDesdeV2()`
- futuras rutas de snapshot y restauracion

## Resultado esperado del paquete

Al terminar, debe existir un formato comun y estable para representar el resultado de una operacion de persistencia, aunque todavia no se use en toda la app.

## Contrato propuesto

### Forma base

```js
{
  ok: true,
  reason: "success",
  operation: "storage-set",
  key: "mtg_coleccion_estado_v3",
  wroteMainState: false,
  wroteSnapshot: false,
  bytes: 0,
  error: null,
  details: null
}
```

### Campos obligatorios

- `ok`: boolean
- `reason`: codigo corto de resultado
- `operation`: nombre de la operacion
- `key`: clave de storage afectada o `null`
- `wroteMainState`: boolean
- `wroteSnapshot`: boolean
- `bytes`: tamaño aproximado si aplica
- `error`: `Error` o `null`
- `details`: objeto adicional o `null`

## Helpers a introducir

### 1. Constructor base de resultado

```js
function createStorageResult(partial = {}) {}
```

Responsabilidad:

- devolver un objeto completo con defaults coherentes

### 2. Helper de exito

```js
function createStorageSuccessResult(partial = {}) {}
```

Responsabilidad:

- crear un resultado `ok: true`
- normalizar valores como `bytes`, `wroteMainState`, `wroteSnapshot`

### 3. Helper de error

```js
function createStorageFailureResult(partial = {}) {}
```

Responsabilidad:

- crear un resultado `ok: false`
- garantizar `reason` legible
- adjuntar `error` y `details` si existen

### 4. Clasificador minimo de error de storage

```js
function classifyStorageError(err) {}
```

Salida esperada inicial:

- `storage-quota-exceeded`
- `storage-security-blocked`
- `storage-unknown-error`

Nota:

En este paquete no hace falta aun cubrir errores especificos de validacion de `estado3`; eso pertenece al paquete siguiente.

### 5. Estimador de tamaño opcional

```js
function getApproxStorageBytes(value) {}
```

Responsabilidad:

- estimar bytes de una string serializada o devolver `0` si no aplica

## Reglas de implementacion

1. los helpers deben ser puros o casi puros
2. no deben tocar DOM
3. no deben invocar `sbMarkDirty()`
4. no deben escribir en localStorage por si solos
5. no deben depender de `estado3`, `estado2` ni de estructuras del dominio

## Integracion permitida en este paquete

Integracion minima permitida:

- definir helpers cerca de `safeLocalStorageGet/Set/Remove`
- añadir comentarios o docstrings de uso esperado

Integracion no permitida todavia:

- hacer que `safeLocalStorageSet()` devuelva ya un objeto estructurado
- tocar `guardarEstado3()`
- modificar `cargarEstado3()`

## Orden recomendado de implementacion

1. añadir `classifyStorageError(err)`
2. añadir `getApproxStorageBytes(value)`
3. añadir `createStorageResult(partial)`
4. añadir `createStorageSuccessResult(partial)`
5. añadir `createStorageFailureResult(partial)`

## Ejemplos de resultado

### Exito simple

```js
createStorageSuccessResult({
  operation: "storage-set",
  key: "mtg_coleccion_estado_v3",
  wroteMainState: true,
  bytes: 48213
})
```

### Fallo por cuota

```js
createStorageFailureResult({
  operation: "storage-set",
  key: "mtg_coleccion_estado_v3",
  reason: "storage-quota-exceeded",
  error: err
})
```

## Criterios de aceptacion

El paquete queda cerrado cuando:

1. existe un formato unico de resultado estructurado
2. existe un clasificador minimo de errores de storage
3. los helpers no cambian ningun flujo de guardado actual
4. el editor no reporta errores nuevos

## Criterios de rechazo

Hay que deshacer o replantear el paquete si:

- termina tocando flujos de usuario
- obliga a cambiar la firma de helpers usados ampliamente
- mezcla validacion de `estado3` con la capa base de resultado
- introduce dependencias circulares con logica de sync o UI

## Salida hacia el siguiente paquete

Cuando este paquete exista, el Paquete 2 podra apoyarse en el mismo contrato para que `guardarEstado3Seguro()` devuelva resultados consistentes desde el primer dia.