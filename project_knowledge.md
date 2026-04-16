# Astar's Settings Profiles — Project Knowledge Base

> **Scopo:** Documento di riferimento rapido per AI / sviluppatori. Leggi questo prima di toccare la codebase.

---

## 1. Identità del progetto

| Campo | Valore |
|---|---|
| Plugin ID | `astar-settings-profiles` |
| Nome | `Astar's Settings Profiles` |
| Versione | `0.8.1` |
| minAppVersion | `0.15.0` |
| isDesktopOnly | `false` (supporto mobile completo) |
| Autore | astar |
| Entry point build | `main.js` (via esbuild) |
| TypeScript config | `tsconfig.json` / `tsc -noEmit -skipLibCheck` |

---

## 2. Struttura del progetto

```
settings-profiles-obsidian-plugin/
├── manifest.json                  ← Metadati plugin Obsidian
├── package.json
├── esbuild.config.mjs             ← Build script (output: main.js)
├── tsconfig.json
└── src/
    ├── main.ts                    ← Classe principale SettingsProfilesPlugin
    ├── constants.ts               ← Nomi delle icone Lucide
    ├── types.d.ts                 ← Dichiarazioni di tipo globali
    ├── core/
    │   └── PluginExtended.ts      ← Estensione di Plugin con StatusBar helpers
    ├── settings/
    │   ├── SettingsInterface.ts   ← Tutte le interfacce, tipi e default
    │   └── SettingsTab.ts         ← Pannello impostazioni (PluginSettingTab)
    ├── modals/
    │   ├── DialogModal.ts         ← Modale conferma generica (sì/no)
    │   ├── ProfileOptionsModal.ts ← Modale per creare/editare un profilo
    │   └── ProfileSwitcherModal.ts← SuggestModal per cambiare profilo
    └── util/
        ├── FileSystem.ts          ← Tutte le operazioni su file via DataAdapter
        └── SettingsFiles.ts       ← Lettura/scrittura dei dati profilo (JSON)
```

---

## 3. Architettura e flusso dati

```
Obsidian app
    │
    ▼
SettingsProfilesPlugin  (src/main.ts)
    ├── vaultSettings: VaultSettings   ← Persisto in data.json via this.saveData()
    ├── globalSettings: GlobalSettings ← In-memory (profilesList ricaricata da file)
    │
    ├── Legge/scrive profili su disk via:
    │       util/SettingsFiles.ts  →  util/FileSystem.ts  →  app.vault.adapter
    │
    ├── UI:
    │       SettingsTab.ts         ← pannello impostazioni
    │       ProfileSwitcherModal   ← fuzzy finder per switch
    │       ProfileOptionsModal    ← form create/edit profilo
    │       DialogModal            ← confirm dialog
    │
    └── StatusBar: PluginExtended.ts (wrapper addStatusBarItem / updateStatusBarItem)
```

### Lifecycle dei settings

```
onload()
  └─ loadSettings()
       ├─ Object.assign({}, DEFAULT_VAULT_SETTINGS, await this.loadData())
       └─ refreshProfilesList()   ← legge profile.json da disco

saveSettings()
  └─ this.saveData(this.vaultSettings)   ← scrive data.json
     (rimuove chiavi non presenti in DEFAULT_VAULT_SETTINGS → no legacy keys)
```

---

## 4. Struttura `data.json` (VaultSettings)

```jsonc
{
  // Profilo attivo condiviso fra tutti i device (usato se deviceActiveProfile=false)
  "activeProfile": {
    "name": "nome-profilo",
    "modifiedAt": "2026-04-15T13:01:55.760Z"
  },

  // Flag: se true ogni device ha il proprio profilo attivo indipendente
  "deviceActiveProfile": false,

  // Mappa deviceID → profilo attivo locale (usata se deviceActiveProfile=true)
  "deviceProfiles": {
    "uuid-win": { "name": "desktop", "modifiedAt": "..." },
    "uuid-android": { "name": "mobile", "modifiedAt": "..." }
  },

  // Auto-save profilo corrente quando cambia qualcosa
  "profileUpdate": true,
  "profileUpdateDelay": 800,       // ms debounce tra salvataggi automatici

  // Aggiornamento UI periodico (stato icona status bar)
  "uiUpdate": true,
  "uiUpdateInterval": 1000,        // ms tra ogni controllo UI

  // Mappa deviceID → path cartella profili (per-device)
  "devices": {
    "uuid-win": ".obsidian/plugins/astar-settings-profiles/profiles"
  },

  // Interazione status bar
  "statusbarInteraction": {
    "click": "auto",
    "ctrl_click": "none",
    "shift_click": "none",
    "alt_click": "none"
  }
}
```

> [!NOTE]
> `profilesPath` (stringa singola) esiste solo come campo `@deprecated`. Se presente viene migrato nel map `devices[deviceID]` al primo avvio.

---

## 5. Struttura profili su disco

```
<profilesPath>/            ← default: .obsidian/plugins/astar-settings-profiles/profiles
    <profile-name>/
        profile.json       ← ProfileOptions serializzato
        appearance.json    ← (se enabled in profilo)
        app.json
        bookmarks.json
        community-plugins.json
        plugins/
            <plugin-id>/
                ...
        core-plugins.json
        hotkeys.json
        graph.json
        workspace.json
        snippets/
        themes/
        ...
```

I file inclusi per ogni profilo dipendono dai toggle `boolean` in `ProfileOptions` e dalla mappa `PROFILE_OPTIONS_MAP` in `SettingsInterface.ts`.

---

## 6. Interfacce principali (`SettingsInterface.ts`)

### `VaultSettings`
Settings persistiti in `data.json`. Aggiungere sempre il campo corrispondente in `DEFAULT_VAULT_SETTINGS`.

### `GlobalSettings`
Solo in-memory: `{ profilesList: ProfileOptions[] }`. Viene ricaricata da disco con `refreshProfilesList()`.

### `ProfileOptions`
```typescript
{
  name: string;
  autoSync: boolean;        // auto-save al cambio
  appearance: boolean;
  app: boolean;
  bookmarks: boolean;
  communityPlugins: boolean;
  corePlugins: boolean;
  graph: boolean;
  hotkeys: boolean;
  modifiedAt: Date;
}
```

### `PROFILE_OPTIONS_MAP`
Mappa ogni chiave di `ProfileOptions` a `{ name, description, file?, ignore? }`.
- `file` → path (o array di path, con placeholder `/*` e `/*/`) dei file da sincronizzare
- `ignore` → path da escludere dalla sync (es. `plugins/settings-profiles-v2`)
- **Aggiornare sempre questa mappa quando si aggiunge una nuova opzione al profilo.**

### `Device`
`Record<string, string>` — deviceID → path profili.

---

## 7. File system (`util/FileSystem.ts`)

> [!IMPORTANT]
> **Non usare mai** `fs`, `path`, `node:fs`, o qualsiasi modulo Node.js nativo.
> Tutta l'I/O va fatto tramite `app.vault.adapter` (istanza di `DataAdapter`).

### API usata

| Funzione adapter | Uso |
|---|---|
| `adapter.exists(path)` | Controlla esistenza file/cartella |
| `adapter.stat(path)` | Metadata: `{ type: 'file'|'folder', size, mtime, ctime }` |
| `adapter.read(path)` | Legge testo |
| `adapter.write(path, data)` | Scrive testo |
| `adapter.readBinary(path)` | Legge binario (`ArrayBuffer`) |
| `adapter.writeBinary(path, buf)` | Scrive binario |
| `adapter.mkdir(path)` | Crea cartella |
| `adapter.rmdir(path, recursive)` | Rimuove cartella |
| `adapter.remove(path)` | Rimuove file |
| `adapter.list(path)` | `{ files: string[], folders: string[] }` |

### Funzioni esposte

```typescript
getAllFiles(adapter, path[])        // Risolve placeholder /* e /*/
getAllSubPaths(adapter, path[])     // Lista sottocartelle con placeholder
keepNewestFile(adapter, src[], dst[])
copyFile(adapter, src[], dst[])
copyFolderRecursiveSync(adapter, src[], dst[])
ensurePathExist(adapter, path[])   // Crea ricorsivamente la cartella
isValidPath(path[])
removeDirectoryRecursiveSync(adapter, path[])
filesEqual(adapter, file1, file2)  // Confronto byte-per-byte
FILE_IGNORE_LIST                   // ['.DS_Store'] — file mai copiati
```

> [!TIP]
> Usare sempre `normalizePath()` da `obsidian` prima di qualsiasi path passato all'adapter. I path sono **sempre relativi alla root della vault**.

---

## 8. Logica device ID

Ogni dispositivo ha un UUID generato una sola volta e persistito in `window.localStorage` sotto la chiave `settings-profiles-device-id`.

```typescript
// In main.ts
private getDeviceID(): string {
    let id = window.localStorage.getItem('settings-profiles-device-id');
    if (!id) { /* genera UUID v4 e salva */ }
    return id;
}
```

Il device ID viene usato per:
1. **`devices` map** → path cartella profili per-device
2. **`deviceProfiles` map** → profilo attivo per-device (quando `deviceActiveProfile=true`)

---

## 9. Gestione profilo attivo (logica per-device)

```typescript
// Punto unico di lettura — NON accedere direttamente a vaultSettings.activeProfile
private getActiveProfileEntry(): Partial<ProfileOptions>

// Punto unico di scrittura — scrive su deviceProfiles o activeProfile a seconda del flag
updateCurrentProfile(profile: ProfileOptions | undefined)

// Getter/setter del flag
getDeviceActiveProfile(): boolean
setDeviceActiveProfile(value: boolean)
```

| `deviceActiveProfile` | Storage usato |
|---|---|
| `false` (default) | `vaultSettings.activeProfile` — condiviso tra tutti i device |
| `true` | `vaultSettings.deviceProfiles[deviceID]` — isolato per device |

---

## 10. Modali

| Modale | Classe base Obsidian | Scopo |
|---|---|---|
| `DialogModal` | `Modal` | Confirm generico con callback sì/no e testo personalizzabile |
| `ProfileOptionsModal` | `Modal` | Form per nome + toggle opzioni di un profilo. Usa `structuredClone` sul profilo. |
| `ProfileSwitcherModal` | `SuggestModal<SettingsProfileSuggestion>` | Fuzzy finder. Enter = switch, Shift+Enter = crea con opzioni |

---

## 11. PluginExtended (`core/PluginExtended.ts`)

Estende `Plugin` di Obsidian con:
- `addStatusBarItem(icon?, label?, ariaLabel?, onClick?)` — overload con supporto icona + label + click
- `updateStatusBarItem(item, icon?, label?, ariaLabel?)` — aggiorna in-place senza ricreare
- `removeStatusBarItem(item)` — rimuove l'elemento

---

## 12. Regole di programmazione

### 12.1 File system — REGOLE ASSOLUTE

- ✅ Usare sempre `app.vault.adapter` per ogni operazione I/O
- ✅ Usare sempre `normalizePath()` su ogni path prima di passarlo all'adapter
- ✅ I path sono **relativi alla vault root** (es. `.obsidian/plugins/...`)
- ❌ Mai usare `require('fs')`, `require('path')`, `import fs from 'fs'`
- ❌ Mai usare path assoluti di sistema (es. `C:\...`, `/home/...`)
- ❌ Mai usare `__dirname`, `process.cwd()`
- ❌ Mai usare API sincrone (tutto `async/await`)

### 12.2 Settings — REGOLE ASSOLUTE

- ✅ Ogni nuovo campo in `VaultSettings` **deve** avere il suo default in `DEFAULT_VAULT_SETTINGS`
- ✅ `saveSettings()` rimuove automaticamente i campi non presenti nel default (lazy cleanup legacy)
- ✅ Caricare con `Object.assign({}, DEFAULT_VAULT_SETTINGS, await this.loadData())`
- ❌ Mai accedere a `vaultSettings.activeProfile` direttamente → usare `getActiveProfileEntry()`
- ❌ Mai scrivere `vaultSettings.activeProfile` direttamente → usare `updateCurrentProfile()`

### 12.3 Profili — REGOLE

- ✅ Ogni nuova feature di sync va aggiunta in `ProfileOptions` (bool) + `PROFILE_OPTIONS_MAP` (name/desc/file/ignore)
- ✅ Usare `filterIgnoreFilesList()` e `getFilesWithoutPlaceholder()` prima di ogni sync
- ✅ Il plugin stesso va sempre escluso dalla lista dei plugin sincronizzati (`ignore` in `communityPlugins`)
- ✅ Dopo un load di profilo che include `communityPlugins`, chiamare sempre `ensurePluginEnabled()`

### 12.4 UI / Obsidian API

- ✅ Usare sempre `Setting`, `Modal`, `Notice`, `SuggestModal` dall'SDK Obsidian
- ✅ Usare `createFragment()` per descrizioni multi-riga nelle Setting
- ✅ Assegnare `id` html a ogni elemento interattivo (toggle, slider, input) per testabilità
- ✅ Usare `debounce()` su onChange di input testuali e slider (500ms consigliato)
- ✅ Usare `normalizePath()` su qualsiasi path dell'utente prima di salvarlo
- ✅ Icone: usare solo costanti da `constants.ts` (nomi Lucide)
- ❌ Mai usare `innerHTML` o `document.createElement` direttamente → usare `.createEl()`

### 12.5 Robustezza e error handling

- ✅ Wrappare ogni operazione asincrona in `try/catch`
- ✅ Nel catch: arricchire il messaggio dell'errore con contesto (`+ (e as Error).message`)
- ✅ Mostrare `new Notice(...)` solo se l'errore è visibile all'utente
- ✅ Fare `console.error(e)` per debug
- ✅ Restituire valori di fallback sicuri (es. `return []`, `return false`) nei metodi utility
- ❌ Mai fare `throw` da metodi pubblici del plugin senza `try/catch` nel chiamante

### 12.6 Compatibilità mobile (Android / iOS)

- ✅ Zero dipendenze Node.js (già rimosso `fs`, `path`, `@folder/xdg`, `node-machine-id`)
- ✅ Usare solo API `app.vault.adapter` per I/O
- ✅ Usare `window.localStorage` per storage locale non-vault (device ID)
- ✅ I path devono rimanere **dentro la vault** — path esterni non funzionano su Android
- ❌ Mai usare `app.vault.adapter.getBasePath()` in produzione (non disponibile su mobile)
- ❌ Mai usare `manifest.dir` come path assoluto

### 12.7 TypeScript

- ✅ `strict` mode attivo — evitare `any` dove possibile
- ✅ Usare `as Error` per i catch (evitare `any` implicito)
- ✅ Usare `structuredClone()` per copie profonde degli oggetti settings
- ✅ Usare `Object.prototype.hasOwnProperty.call(obj, key)` per iterare le chiavi
- ✅ Build di verifica: `npm run build` (tsc + esbuild, deve completare senza errori)

---

## 13. Comandi registrati nel plugin

| Command ID | Nome | Azione |
|---|---|---|
| `open-profile-switcher` | Open profile switcher | Apre `ProfileSwitcherModal` |
| `current-profile` | Show current profile | Notice con nome profilo corrente |
| `save-current-profile` | Save current profile | Salva settings correnti nel profilo attivo |
| `load-current-profile` | Reload current profile | Carica il profilo attivo da disco |
| `update-profile-status` | Update profile status | Forza aggiornamento icona status bar (solo se `uiUpdate=true`) |

---

## 14. File da NON modificare senza motivo

| File | Perché |
|---|---|
| `esbuild.config.mjs` | Build config — non toccare |
| `manifest.json` | Cambiare solo `version` e `description` |
| `src/types.d.ts` | Solo dichiarazioni ambient TypeScript |
| `src/core/PluginExtended.ts` | Stabile, solo se serve estendere status bar API |
