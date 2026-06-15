# Checklist manual de filtros del set

Objetivo: validar que los filtros del set funcionan de forma consistente y sin regresiones.

## Preparacion

1. Abrir la app y entrar en Colecciones.
2. Abrir un set con mezcla de cartas monocolor, multicolor e incoloras.
3. Abrir panel Filtros del set.
4. Asegurarse de que:
- En posesion desactivado.
- En falta desactivado.
- Filtrar por color desactivado.
- Rarezas: todas activadas.

## Casos base

1. Busqueda por texto
- Escribir parte del nombre de una carta conocida.
- Esperado: solo cartas cuyo nombre contiene el texto.
- Limpiar texto.
- Esperado: vuelve listado completo.

2. Filtro En posesion
- Activar En posesion.
- Esperado: solo cartas con cantidad total > 0.
- Activar En falta sin quitar En posesion.
- Esperado: En posesion se desactiva automaticamente (mutuamente excluyentes).

3. Filtro En falta
- Activar En falta.
- Esperado: solo cartas con cantidad total = 0.
- Activar En posesion.
- Esperado: En falta se desactiva automaticamente.

## Casos de color

1. Blanco
- Activar Filtrar por color.
- Marcar Blanco (W).
- Esperado: aparecen cartas cuya identidad contiene W.

2. Blanco + Azul
- Marcar W y U.
- Esperado: semantica OR (cartas con W o U, incluyendo multicolor que contenga alguno).

3. Incoloro (C)
- Desmarcar W/U/B/R/G, dejar solo C.
- Esperado: solo cartas incoloras (identidad vacia o C).

4. Incoloro + Rojo
- Marcar C y R.
- Esperado: OR, aparecen cartas incoloras o rojas.

5. Master color sin subcolores
- Dejar Filtrar por color activado pero sin checks de color.
- Esperado: no se aplica filtro de color (listado no se reduce por color).

## Casos de rareza

1. Solo Comun
- Dejar marcada solo Comun.
- Esperado: solo cartas comunes.

2. Ninguna rareza marcada
- Desmarcar todas las rarezas.
- Esperado: 0 resultados.

3. Todas marcadas
- Marcar las cuatro rarezas.
- Esperado: no se restringe por rareza.

## Casos combinados

1. En falta + color
- Activar En falta y color Verde.
- Esperado: solo cartas verdes que faltan.

2. En posesion + color + rareza
- Activar En posesion, color Azul, solo Infrecuente.
- Esperado: solo cartas azules infrecuentes que tengas.

## Criterio de aceptacion

1. No hay errores en consola al cambiar filtros.
2. Los toggles En posesion/En falta se excluyen entre si siempre.
3. El color responde de forma estable al marcar/desmarcar checks.
4. El recuento visual de cartas cambia de forma coherente con cada filtro.
