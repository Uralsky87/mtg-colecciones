# Guia de Comparticion

## Carpeta recomendable para compartir

Para una revision de codigo o funcional, comparte solo:

- `app.js`
- `electron-main.js`
- `index.html`
- `styles.css`
- `service-worker.js`
- `manifest.webmanifest`
- `package.json`
- `package-lock.json`
- `BUILD_EXE.md`
- `README.md`
- `icons/`
- `build/` si el icono `.ico` realmente esta ahi y se usa para empaquetar
- `scripts/` si contiene utilidades propias del proyecto

## Carpetas y archivos que no conviene compartir como codigo fuente

- `node_modules/`
- `release/`
- `release-installer/`
- `release-portable/`
- cualquier salida generada temporal o de build

## Documentos internos del proyecto

Estos documentos son utiles para trabajo interno, planificacion o notas propias, no para una primera revision funcional:

- `PLAN_INVENTARIO_V3.md`
- `PLAN_MULTIIDIOMA_GRADUAL.md`
- `PLAN_OPTIMIZACIONES.md`
- `REVISION_CODIGO.md`

Puedes compartirlos solo si quieres dar contexto tecnico adicional.
