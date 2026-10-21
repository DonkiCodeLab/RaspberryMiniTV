The language registry is `DeviceApp/languages.json`. Both applications use its identifiers, native names, flags, formatting locales and writing direction.

Web UI translations are complete English messages mapped to translations in `WebApp/src/i18n/locales/`. Keep placeholders such as `{name}` unchanged. Translate complete messages; never translate user data, filenames or media titles by replacing individual words. Spanish, Catalan and English component tables retain their existing context-specific wording. Other languages use the same keys through `withLanguages`.

The catalogs are stored in the repository and work offline. They are authored directly with AI assistance; the app does not call Google Translate or another translation service. Nigerian Pidgin (`pcm`) and Egyptian Arabic (`arz`) have separate catalogs.

After adding UI messages, run these commands from the repository root:

```sh
node tools/i18n/extract.mjs
# Translate all newly added source messages in every locale catalog.
node tools/i18n/sync-device.mjs
node --test WebApp/tests/i18n.test.js
```

Extraction appends new messages without reordering existing ones. `sync-device.mjs` refuses missing messages or changed placeholders. Run the full web and device tests for changes to language selection or persistence.

On Raspberry Pi, `DeviceApp/install_language_support.sh` installs Noto fonts and Pango/Cairo. The updater invokes it automatically. [python3-gi-cairo](https://packages.debian.org/stable/python/python3-gi-cairo) connects Cairo to GObject. Pango provides font fallback, bidirectional text and Indic shaping; on macOS, the preview uses Pillow with the system Unicode font. Dropdown labels remain native names even when the surrounding UI uses another language.

Media titles, filenames and personal content are preserved. Metadata providers are queried with the selected language. Local browsing falls back to existing cached metadata if that language has not been downloaded; changing the interface language does not trigger a full-library network download.
