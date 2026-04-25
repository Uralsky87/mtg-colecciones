# Guia de Ejecucion del Plan de Fiabilidad

## Objetivo

Traducir `PLAN_FIABILIDAD_Y_RECUPERACION_DATOS.md` a una hoja de ruta ejecutable con reglas claras, paquetes de trabajo pequeños y criterios de parada para no alterar la funcionalidad base de la app.

Este documento no redefine arquitectura.

Su funcion es marcar:

- en que orden conviene tocar el codigo
- que reglas deben cumplirse antes, durante y despues de cada cambio
- como saber si una iteracion esta suficientemente cerrada

## Regla maestra de ejecucion

Toda implementacion de este bloque debe cumplir simultaneamente estas condiciones:

1. no cambiar la funcionalidad esperada por el usuario
2. no rediseñar flujos de uso
3. no mezclar cambios de fiabilidad con refactors amplios no necesarios
4. no tocar a la vez persistencia, sync cloud y render salvo que el paquete lo exija de forma explicita
5. cerrar cada paquete con validacion local acotada

## Reglas operativas

### Regla 1 - Un solo objetivo tecnico por paquete

Cada paquete debe resolver una sola pieza del problema.

Ejemplos correctos:

- introducir guardado seguro de `estado3`
- introducir snapshot previo
- introducir boot state health

Ejemplos incorrectos:

- tocar guardado seguro, sync cloud y mensajes visuales en el mismo paquete

### Regla 2 - Preservar interfaces publicas cuando sea posible

Siempre que no haya una razon fuerte para romperlas:

- mantener `guardarEstado3()` como API publica
- mantener `init()` como punto de entrada
- encapsular mejoras detras de helpers nuevos

Objetivo:

- endurecer internamente sin reventar llamadas ya distribuidas por `app.js`

### Regla 3 - Separar cambios criticos de cambios cosméticos

Si un paquete incluye un cambio visible, este debe ser exclusivamente uno de estos tipos:

- mensaje de recuperacion
- aviso de fallo de persistencia
- estado visible de modo degradado

No se deben mezclar con pulido visual general.

### Regla 4 - Validar por capas

Antes de considerar terminado un paquete, validar en este orden:

1. no hay errores de editor
2. el flujo tecnico tocado sigue funcionando
3. no hay cambio funcional visible no deseado

### Regla 5 - Si un paquete exige una decision abierta, cerrarla antes de tocar codigo

No implementar sobre una ambigüedad importante.

En este bloque, las decisiones abiertas principales son:

- snapshot desde storage previo o desde memoria previa
- metadata de snapshot embebida o separada
- modo de coordinacion entre recovery local y pull cloud

## Secuencia recomendada de ejecucion

### Etapa 1 - Cimientos de persistencia

Objetivo:

- asegurar guardado y restauracion local minima antes de tocar arranque o sync

Paquetes:

1. introducir utilidades de resultado estructurado para persistencia
2. introducir `guardarEstado3Seguro()` sin cambiar aun el arranque
3. redirigir `guardarEstado3()` al guardado seguro

### Etapa 2 - Red de seguridad local

Objetivo:

- crear snapshot previo y restauracion local simple

Paquetes:

4. introducir contrato de snapshot y metadata
5. guardar snapshot previo antes de sobrescribir `estado3`
6. introducir helper de restauracion desde snapshot

### Etapa 3 - Salud de arranque

Objetivo:

- dejar de arrancar de forma silenciosa cuando el estado es invalido

Paquetes:

7. introducir objeto `bootStateHealth`
8. extraer `bootLoadPersistentState()`
9. integrar fallback a snapshot en arranque

### Etapa 4 - Mensajeria y degradacion controlada

Objetivo:

- explicar mejor el estado del dato sin alterar flujo funcional

Paquetes:

10. introducir notices de recovery y degraded mode
11. reutilizar `syncStatus` o canal equivalente para avisos no intrusivos

### Etapa 5 - Coordinacion minima con nube

Objetivo:

- evitar que un recovery local sea pisado sin aviso

Paquetes:

12. introducir flag de sesion para recovery pendiente
13. frenar `sbPullNow()` automatico o directo sobre estado recuperado
14. dejar aviso claro cuando la nube compite con el estado local recuperado

## Paquetes de trabajo detallados

## Paquete 1 - Resultado estructurado de persistencia

### Objetivo

Definir un formato comun de respuesta para guardado, snapshot y restauracion.

### Cambios permitidos

- nuevos helpers puros
- tipos de resultado documentados en comentarios o docs

### Cambios prohibidos

- alterar todavia comportamiento de guardado existente

### Hecho cuando

- existe una forma comun de devolver `ok`, `reason`, `error`, `wroteMainState`, `wroteSnapshot`

## Paquete 2 - `guardarEstado3Seguro()`

### Objetivo

Introducir el guardado seguro real de v3.

### Cambios permitidos

- nuevos helpers de validacion y clasificacion de error
- delegacion de `guardarEstado3()` al helper seguro

### Cambios prohibidos

- meter todavia snapshot o recovery de arranque si complica el paquete

### Riesgo principal

- cambiar efectos laterales de `sbMarkDirty()` o del orden de guardado

### Hecho cuando

- `guardarEstado3()` sigue funcionando en los flujos actuales
- si el guardado falla, el error queda estructurado y no silencioso

## Paquete 3 - Snapshot previo

### Objetivo

Guardar una copia valida del estado anterior sin bloquear el guardado principal.

### Cambios permitidos

- nuevas claves snapshot
- helper de build y validacion de snapshot

### Cambios prohibidos

- reescribir todavia el arranque completo

### Hecho cuando

- si ya existia un `estado3` sano, queda snapshot previo antes del siguiente guardado

## Paquete 4 - Restauracion desde snapshot

### Objetivo

Permitir recuperar el estado principal desde la copia previa.

### Hecho cuando

- existe helper restaurador con resultado estructurado
- la restauracion no pisa silenciosamente otros bloques no relacionados

## Paquete 5 - Orquestador de arranque

### Objetivo

Centralizar la carga de persistencia critica.

### Cambios permitidos

- extraer logica de `init()` a helper dedicado

### Cambios prohibidos

- mezclar catalogo, MTGJSON o limpieza de caches con la salud del inventario

### Hecho cuando

- `init()` delega la salud de persistencia a un unico punto

## Paquete 6 - Notificaciones de recovery y degraded mode

### Objetivo

Hacer visible al usuario cuando la app ha tenido que recuperarse o degradarse.

### Cambios permitidos

- mensajes no intrusivos
- reutilizar `syncStatus`, `msgBackup` o un banner ya existente

### Cambios prohibidos

- introducir un sistema nuevo y complejo de notificaciones

### Hecho cuando

- recovery local y degraded mode dejan una señal visible y comprensible

## Paquete 7 - Coordinacion minima con cloud

### Objetivo

Evitar sobreescritura silenciosa tras recovery local.

### Cambios permitidos

- flags de sesion
- guardas antes de `sbPullNow()` o de aplicacion de payload cloud

### Cambios prohibidos

- implementar aun merge completo multidispositivo

### Hecho cuando

- tras un recovery local, la nube no pisa automaticamente el estado sin aviso

## Matriz de dependencias

| Paquete | Depende de | Desbloquea |
| --- | --- | --- |
| 1 | ninguno | 2, 3, 4 |
| 2 | 1 | 3, 5 |
| 3 | 1, 2 | 4, 5 |
| 4 | 1, 3 | 5 |
| 5 | 2, 4 | 6, 7 |
| 6 | 5 | cierre usable del bloque |
| 7 | 5 | coordinacion minima con sync |

## Criterios de aceptacion por iteracion

Cada iteracion debe cerrar con estas preguntas respondidas:

1. que pieza exacta se ha endurecido
2. que comportamiento funcional del usuario se ha preservado
3. que validacion minima se ha ejecutado
4. que riesgo queda abierto para la siguiente iteracion

## Criterios de parada

Hay que pausar y revisar si ocurre cualquiera de estos casos:

- un paquete exige tocar demasiadas zonas no previstas
- aparece una incompatibilidad fuerte entre recovery local y sync cloud
- la implementacion obliga a cambiar flujo funcional visible
- la validacion deja dudas sobre posible perdida de datos

## Definition of Done del bloque de fiabilidad

Este bloque puede considerarse listo para implementación estable cuando:

1. `guardarEstado3Seguro()` existe y sustituye el guardado directo
2. existe snapshot previo valido
3. el arranque usa un orquestador de salud del dato
4. recovery local y degraded mode son visibles de forma controlada
5. la nube no pisa silenciosamente un recovery local

## Siguiente uso de este documento

Cuando empecemos a implementar, este documento debe servir como tablero de avance.

La forma recomendada de usarlo es:

1. elegir un paquete
2. confirmar reglas y cambios permitidos
3. implementar solo ese paquete
4. validar
5. anotar riesgos residuales antes de pasar al siguiente