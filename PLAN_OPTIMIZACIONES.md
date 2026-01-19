# Plan Prioritario de Optimización Interna

Este plan propone mejoras internas sin cambiar la UI/funcionalidad actual, organizadas por lotes con criterios de aceptación y métricas.

## Prioridades
- Lote 1: Render y DOM (impacto inmediato en sets grandes)
- Lote 2: Delegación de eventos (reduce listeners y GC)
- Lote 3: Búsqueda y cancelación (responsive bajo escritura)
- Lote 4: Caché runtime en Service Worker (latencia y offline)
- Lote 5: Escrituras y serialización (robustez y reducción de I/O)
- Baseline: Métricas y perfilado (garantiza medición antes/después)

## Baseline: Métricas y Perfilado
- Qué: Medir tiempos de `renderTablaSet`, `renderColecciones`, búsqueda y navegación.
- Dónde: app.js (instrumentación mínima con `performance.now()` en funciones críticas).
- Aceptación:
  - Capturar y registrar 5 métricas clave por operación.
  - Generar reporte inicial con baseline en consola (modo DEBUG).

## Lote 1: DOM Render Performance
- Objetivo: Reducir coste de `innerHTML` en bucles y sincronizar con frame.
- Cambios propuestos (internos):
  - Construcción con `DocumentFragment` o `<template>` antes de insertar en [app.js](app.js#L3228-L3247).
  - `scheduleRenderColecciones()` usando `requestAnimationFrame` para sincronía de frame.
- Aceptación:
  - Tiempo de render de `renderTablaSet` reduce ≥30% en sets de 200+ cartas.
  - Fluidez perceptible sin jank durante operaciones masivas.

## Lote 2: Event Delegation Consolidation
- Objetivo: Evitar listeners por elemento; único listener en contenedor.
- Cambios propuestos (internos):
  - Delegar `click/change` de `.btn-qty-*` y acciones en `#listaCartasSet`.
  - Revisión de `wireControlesModalCarta` para minimizar wiring por instancia.
- Aceptación:
  - Listeners totales por vista ≤5 (ver [REVISION_CODIGO.md](REVISION_CODIGO.md#L220-L247)).
  - No se crean listeners adicionales en re-renders sucesivos.

## Lote 3: Abortable Fetch + Search Cache
- Objetivo: Cancelar trabajo obsoleto y cachear normalizaciones.
- Cambios propuestos (internos):
  - `AbortController` para peticiones de búsqueda/sets si el usuario navega/teclea.
  - Cache de `normalizarTexto()` por carta/id; reuso en filtros.
- Aceptación:
  - Sin trabajo de red activo tras cambio de pantalla/entrada.
  - Latencia percibida de búsqueda reduce ≥20% con tecleo rápido.

## Lote 4: Service Worker Runtime Caching
- Objetivo: Mejorar latencia y offline de assets y imágenes de Scryfall.
- Cambios propuestos (internos):
  - Estrategia `stale-while-revalidate` para `app.js` y `styles.css` en [service-worker.js](service-worker.js#L46-L66).
  - Cache selectivo por origen de imágenes con expiración segura.
  - Fallback de navegación consistente (usar `index.html` relativo).
- Aceptación:
  - Re-cargas posteriores más rápidas (tiempos de TTI menores).
  - Fallback funciona en local y producción sin 404.

## Lote 5: Storage Coalescing + Safety
- Objetivo: Reducir I/O y robustecer escrituras.
- Cambios propuestos (internos):
  - Coalescer writes de `estado2` (partes modificadas + batch) y try/catch en `localStorage`.
  - IndexedDB: usar `tx.oncomplete` en `saveSetToDB` y revisar lecturas en [app.js](app.js#L60-L130).
- Aceptación:
  - Escrituras a `localStorage` reducidas ≥50% sin pérdida de estado.
  - Manejo seguro de cuotas/errores sin bloquear la UI.

## Métricas y Seguimiento
- KPIs:
  - ms por `renderTablaSet` (p50/p95), ms por búsqueda (p50/p95).
  - Número de listeners activos por pantalla.
  - Peticiones de red por sesión (antes/después).
- Instrumentación: flag `DEBUG` para habilitar logs de medición.

## Despliegue por Lotes
1. Baseline (medir, sin cambios visuales).
2. Lote 1 + pruebas de fluidez.
3. Lote 2 + verificación de eventos.
4. Lote 3 + pruebas con tecleo rápido.
5. Lote 4 + verificación offline/local.
6. Lote 5 + validación de consistencia.

## Riesgos y Mitigaciones
- Delegación: cuidado con `e.target` en elementos anidados; usar `closest()`.
- SW: evitar cachear respuestas no-OK ni cross-origin inseguras.
- Abort: gestionar limpieza de controladores para evitar leaks.

## Próximos pasos
- Aprobación del orden de lotes.
- Implementación del Baseline de métricas.
- Ejecutar Lote 1 y validar impacto.
