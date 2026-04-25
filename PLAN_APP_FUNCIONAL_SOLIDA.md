# Plan Tecnico de Consolidacion

## Objetivo

Convertir ManaCodex en una app de coleccionismo mas funcional, solida y profesional en cinco ejes:

- persistencia fiable de la coleccion
- inventario coherente por print, idioma y set
- busqueda realmente util para saber si una carta se tiene o no
- vision clara de completitud y faltantes por coleccion
- sincronizacion entre dispositivos sin riesgo alto de pisado o perdida

Este plan no sustituye a `PLAN_INVENTARIO_V3.md` ni a `PLAN_MULTIIDIOMA_GRADUAL.md`.

Su papel es ordenar el trabajo de consolidacion del producto a partir del estado actual real de la app.

## Restriccion de alcance

Este plan asume una condicion de producto explicita:

- no cambiar la funcionalidad esperada de la app
- no redefinir flujos de uso salvo cuando sea imprescindible para proteger datos o hacer mas clara la misma funcionalidad ya existente
- priorizar optimizacion tecnica, solidez, mantenibilidad y pulido estetico sin alterar el comportamiento funcional base

## Principios de trabajo

1. La fiabilidad del dato va antes que la ampliacion de funciones.
2. La fuente de verdad del inventario debe ser unica o, como minimo, operacionalmente inequívoca.
3. El idioma visible nunca debe degradar la exactitud de la posesion real.
4. Los flujos principales del coleccionista deben poder usarse sin depender totalmente de la red.
5. Cada fase debe cerrar con criterios de salida verificables.
6. Toda mejora debe intentar preservar el comportamiento funcional actual salvo correccion de errores o proteccion explicita del dato.

## Diagnostico resumido

### Lo que ya esta bien encaminado

- existe una base de inventario v3 por `printId`
- la app ya distingue parcialmente entre idioma visible y posesion real
- hay progreso por set, filtros y vista de faltantes
- la busqueda ya cruza resultados con estado de posesion
- existe sincronizacion con nube y guardado local

### Lo que hoy sigue debilitando el producto

- coexistencia prolongada entre `estado`, `estado2` y `estado3`
- riesgo de perdida silenciosa por corrupcion o sustitucion de estado
- busqueda principal demasiado dependiente de Scryfall para responder algo tan basico como "la tengo o no"
- criterios de completitud todavia poco explicitados en UX y en modelo
- sincronizacion cloud basada en payload completo, no en merge por entidad
- `app.js` concentra demasiadas responsabilidades criticas

## Estructura del plan

El plan se divide en cinco bloques.

1. Fiabilidad de datos
2. Unificacion del inventario
3. Busqueda y consulta de posesion
4. Completitud de colecciones
5. Arquitectura y mantenibilidad

Cada bloque tiene fases, entregables y criterios de salida.

---

## Bloque 1 - Fiabilidad de datos

### Objetivo

Garantizar que el usuario no pierda su coleccion por errores de parseo, estados corruptos, cierres inesperados o sincronizaciones incompletas.

### Fase 1.1 - Endurecer persistencia local

#### Trabajo

- introducir snapshots locales versionados del estado canonico
- conservar al menos:
  - estado actual
  - ultimo estado valido anterior
  - timestamp de escritura
- validar el payload antes de persistirlo
- si el estado esta corrupto al cargar:
  - no resetear silenciosamente a vacio
  - intentar recuperar el ultimo snapshot valido
  - mostrar aviso visible al usuario

#### Entregables

- helper de guardado seguro con snapshot
- helper de recuperacion en arranque
- mensaje de recuperacion o error de datos

#### Criterio de salida

- un JSON corrupto no borra la coleccion sin ofrecer recuperacion
- el usuario puede seguir arrancando la app con el ultimo estado sano

### Fase 1.2 - Backup y restauracion como feature real

#### Trabajo

- revisar export/import para que funcionen como mecanismo de seguridad de primer nivel
- añadir metadatos claros en backup:
  - version del esquema
  - fecha
  - numero de prints
  - numero de sets con progreso
- validar importaciones antes de aplicar
- añadir restauracion local desde backup reciente si existe

#### Criterio de salida

- el usuario tiene una ruta clara de recuperacion sin depender solo de Supabase

### Fase 1.3 - Trazabilidad de cambios delicados

#### Trabajo

- registrar eventos de migracion y recuperacion
- registrar cuantas entradas no pudieron mapearse en migraciones
- registrar resumen de sincronizacion cloud

#### Criterio de salida

- los fallos dejan una huella util para depuracion, no solo errores de consola dispersos

---

## Bloque 2 - Unificacion del inventario

### Objetivo

Reducir la deuda de convivencia entre v2 y v3 hasta dejar una fuente de verdad operativa unica para la posesion.

### Fase 2.1 - Auditar todos los puntos que aun escriben o leen v2

#### Trabajo

- inventariar funciones que escriben en `estado2`
- inventariar renders que leen del adaptador legacy
- clasificar cada uso como:
  - lectura transitoria permitida
  - puente necesario
  - deuda a eliminar

#### Entregables

- lista cerrada de funciones legacy activas
- mapa de dependencias entre UI, stats, filtros y progreso

#### Criterio de salida

- no queda ninguna zona gris sobre quien manda realmente en inventario

### Fase 2.2 - Pasar las escrituras visibles a v3 canonico

#### Trabajo

- sustituir `commitEstado2Write` por una capa de escritura canonica v3
- dejar v2 solo como compatibilidad de lectura temporal si sigue siendo necesaria
- revisar:
  - cantidad
  - foil
  - tags
  - contadores
  - acciones masivas

#### Criterio de salida

- toda accion de usuario sobre la coleccion se persiste primero en v3

### Fase 2.3 - Rehacer progreso y stats desde la fuente canonica

#### Trabajo

- recalcular stats y progreso desde v3 sin pasar por agregados legacy
- dejar los datos derivados claramente marcados como cache, no como fuente de verdad
- invalidar y regenerar caches cuando cambie inventario o set cargado

#### Criterio de salida

- progreso y resumen coinciden con el inventario canonico incluso tras reinicio o sync

### Fase 2.4 - Retirada gradual de v2 operativa

#### Trabajo

- mantener compatibilidad solo para migracion/import de datos antiguos
- dejar v2 fuera de las rutas normales de escritura y render
- documentar la fase final de retirada

#### Criterio de salida

- v2 ya no participa en uso normal diario de la app

---

## Bloque 3 - Busqueda y consulta de posesion

### Objetivo

Hacer que el usuario pueda responder rapido y con fiabilidad a preguntas como:

- tengo esta carta o no
- en que set la tengo
- en que idioma la tengo
- cuantas copias tengo

### Fase 3.1 - Separar busqueda local de busqueda externa

#### Trabajo

- definir dos modos de busqueda:
  - busqueda local de inventario y catalogo cargado
  - busqueda externa de prints en Scryfall
- priorizar busqueda local para consultas de posesion
- usar Scryfall como ampliacion, no como dependencia obligatoria para el caso principal

#### Criterio de salida

- la pregunta "la tengo o no" puede resolverse localmente para datos conocidos

### Fase 3.2 - Crear indice local de consulta

#### Trabajo

- construir indices consultables por:
  - nombre normalizado
  - oracleId
  - setCode
  - collectorNumber
  - printId
- incluir resumen de posesion por resultado
- mantener el indice actualizado tras cambios de inventario y tras carga de sets

#### Criterio de salida

- la busqueda local responde rapido sin depender del render actual ni de resultados remotos

### Fase 3.3 - Mejorar la UX de resultados

#### Trabajo

- mostrar para cada carta encontrada:
  - total de copias
  - sets donde se posee
  - idiomas poseidos
  - acceso directo al set exacto
- diferenciar claramente:
  - no encontrada en datos
  - encontrada pero no poseida
  - poseida en otro idioma o set

#### Criterio de salida

- la pantalla de buscar responde bien al caso de coleccionista, no solo al caso de exploracion general

---

## Bloque 4 - Completitud de colecciones

### Objetivo

Hacer que la app exprese de forma clara y fiable lo que falta para completar un set o una linea de coleccion.

### Fase 4.1 - Definir el contrato de completitud

#### Trabajo

- fijar explicitamente que significa "completar un set"
- distinguir, como minimo:
  - poseo la carta en cualquier idioma
  - poseo la carta en idioma exacto del set abierto
  - poseo al menos una copia
  - poseo copia foil o normal
- documentar cual de esos criterios alimenta:
  - progreso visible del set
  - filtro "faltan"
  - estadisticas globales

#### Criterio de salida

- completitud deja de ser implicita y pasa a ser una regla de producto clara

### Fase 4.2 - Reforzar el flujo de faltantes

#### Trabajo

- revisar y blindar el filtro de faltantes del set
- añadir tests manuales y automatizables para:
  - carta no poseida
  - carta poseida en otro idioma
  - carta poseida en mismo set con otra variante
  - carta poseida varias veces
- exponer contadores visibles:
  - total del set
  - tengo
  - faltan

#### Criterio de salida

- el usuario puede abrir un set y confiar en que la vista de faltantes refleja la realidad de su coleccion

### Fase 4.3 - Mejorar resumen de colecciones

#### Trabajo

- anadir indicadores rapidos por coleccion:
  - porcentaje completado
  - numero de faltantes
  - ultima actualizacion
  - idioma base considerado
- valorar filtros rapidos por:
  - casi completas
  - sin empezar
  - con alguna copia
  - ocultas / pausadas

#### Criterio de salida

- la pantalla de colecciones se vuelve una herramienta de trabajo real para completar sets

---

## Bloque 5 - Sincronizacion y uso multidispositivo

### Objetivo

Evitar perdida de cambios y reducir el riesgo operativo al usar varios dispositivos.

### Fase 5.1 - Hacer visible el modelo de sincronizacion actual

#### Trabajo

- documentar en UI que la sync actual funciona por payload completo
- exponer estados mas claros:
  - cambios locales pendientes
  - nube mas reciente que local
  - conflicto potencial
  - ultima subida y bajada correctas

#### Criterio de salida

- el usuario entiende cuando puede estar a punto de pisar datos

### Fase 5.2 - Preparar merge por entidad

#### Trabajo

- definir si el merge se hará por:
  - printId
  - preferencias UI por clave
  - progreso derivado
- marcar que campos son mergeables y cuales deben regenerarse
- conservar `updatedAt` por entrada de inventario y por bloque de preferencias donde haga falta

#### Criterio de salida

- existe contrato tecnico para evolucionar desde sync por payload completo a merge parcial seguro

### Fase 5.3 - Implementar resolucion basica de conflictos

#### Trabajo

- introducir una primera politica simple, por ejemplo:
  - merge de inventario por entrada mas reciente
  - caches y stats siempre regenerables
  - progreso derivado no sincronizado como fuente de verdad
- registrar resumen post-merge

#### Criterio de salida

- dos dispositivos no dependen solo de un "actualiza antes de guardar"

---

## Bloque 6 - Arquitectura y mantenibilidad

### Objetivo

Reducir el riesgo de regresion y facilitar que futuras mejoras no rompan colecciones ni inventario.

### Fase 6.1 - Extraer modulos criticos de `app.js`

#### Prioridad de extraccion

1. persistencia y migraciones
2. inventario y resolucion de posesion
3. sincronizacion cloud
4. busqueda
5. progreso y stats

#### Criterio de salida

- las responsabilidades criticas dejan de vivir mezcladas con render y handlers de DOM

### Fase 6.2 - Crear bateria minima de validacion funcional

#### Cobertura minima

- persistencia local tras reinicio
- cambio de cantidad y foil
- progreso de set
- filtro faltan
- busqueda de carta poseida y no poseida
- sync pull/push sin conflicto
- migracion desde datos anteriores

#### Criterio de salida

- antes de tocar inventario o sync existe una red minima de seguridad

### Fase 6.3 - Instrumentacion y errores visibles

#### Trabajo

- elevar errores importantes de consola a mensajes controlados de UI
- normalizar logs de migracion, sync y recuperacion
- separar fallos recuperables de fallos fatales

#### Criterio de salida

- los problemas criticos dejan de depender de abrir DevTools para entenderse

---

## Priorizacion recomendada

### Etapa A - Critica

- Bloque 1 completo
- Bloque 2 hasta tener escrituras canonicas v3
- Bloque 4.1 y 4.2

### Etapa B - Producto base profesional

- Bloque 3 completo
- Bloque 4.3
- Bloque 5.1

### Etapa C - Solidez avanzada

- Bloque 5.2 y 5.3
- Bloque 6 completo

## Orden de ejecucion sugerido

1. endurecer persistencia local
2. cerrar fuente canonica v3
3. redefinir completitud y faltantes
4. separar busqueda local y externa
5. mejorar sync multidispositivo
6. modularizar y añadir validaciones

## Criterios globales de exito

La app podra considerarse claramente mas funcional, solida y profesional cuando se cumplan estos puntos:

- un fallo de parseo o una carga corrupta no vacia silenciosamente la coleccion
- el inventario visible se apoya en una fuente canonica unica
- el usuario puede saber localmente si tiene una carta y en que variante
- el progreso de set y los faltantes son consistentes y explicables
- la sincronizacion no depende solo de sustituir payloads completos sin merge
- la base critica deja de depender de un unico archivo gigante

## Propuesta de siguiente paso

Primero conviene ampliar y congelar en detalle la Etapa A.

Eso implica convertir este plan general en tres documentos o tres subplanes ejecutables:

1. plan de fiabilidad y recuperacion de datos
2. plan de cierre operativo de inventario v3
3. plan funcional de completitud y faltantes

Esos tres subplanes son los que mas retorno dan ahora mismo para la experiencia real del coleccionista.