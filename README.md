# ManaCodex

Aplicacion de escritorio en Electron para consultar colecciones de Magic: The Gathering, llevar inventario y sincronizar datos de usuario.

## Estado actual

- La app es funcional para uso diario.
- El sistema de idiomas sigue en evolucion y convive con partes transitorias del inventario v2/v3.
- El codigo fuente principal sigue concentrado en un unico archivo grande (`app.js`), asi que la base funciona mejor de lo que se deja mantener a primera vista.
- La estrategia actual de producto esta acotada a EN/ES, pero algunas ediciones comerciales no pueden exponerse como espanol real si las fuentes de datos no publican esos prints. El caso documentado de referencia es [LIMITACION_INNISTRAD_REMASTERED_ES.md](LIMITACION_INNISTRAD_REMASTERED_ES.md).

## Ejecutar en local

Requisitos:

- Node.js instalado.

Instalacion y arranque:

```bash
npm install
npm run start
```

## Builds de escritorio

```bash
npm run dist:portable
npm run dist:installer
```

Mas detalle en `BUILD_EXE.md`.

## Estructura base

- `electron-main.js`: proceso principal de Electron.
- `index.html`: estructura de pantallas y carga de scripts.
- `styles.css`: estilos globales.
- `app.js`: logica principal de la aplicacion, estado, render, cache, sync y UI.
- `service-worker.js`: cache y actualizacion PWA/web.
- `manifest.webmanifest`: manifiesto web.

## Notas para revision externa

- No hace falta compartir `node_modules` ni carpetas `release*`.
- El proyecto usa recursos externos como Scryfall y Supabase.
- El versionado de recursos y service worker debe mantenerse alineado en cada release.
