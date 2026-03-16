# Crear .exe (Electron)

## Requisitos

- Tener Node.js instalado.
- Haber ejecutado al menos una vez:

```bash
npm install
```

## Comandos

### 1) Probar la app en escritorio

```bash
npm run start
```

### 2) Generar ejecutable portable (.exe)

```bash
npm run dist:portable
```

Salida esperada:

- `release-portable/ManaCodex-Setup-1.0.0.exe`

### 3) Generar instalador (.exe con asistente)

```bash
npm run dist:installer
```

Salida esperada:

- `release-installer/ManaCodex-Setup-1.0.0.exe`

### 4) Build de desarrollo sin instalador

```bash
npm run dist
```

Salida esperada:

- `release-dev/win-unpacked/ManaCodex.exe`

## Problemas comunes

- Error de archivo en uso (app.asar bloqueado): cierra cualquier `ManaCodex.exe` abierto y vuelve a ejecutar el comando.
- Si Windows Defender o antivirus bloquea temporalmente el proceso, reintenta la compilacion.

## Nota

El icono de Windows se toma de:

- `build/icon.ico`
