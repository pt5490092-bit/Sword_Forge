# Sword Forge

The King James Bible with the Apocrypha — 80 books, 1,362 chapters,
36,257 verses — with historical context, chapter notes, study sheets,
highlighting, notes and read-aloud.

## Hosting

Everything here is static. Upload the whole folder to any web host
(Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3, or plain nginx).
There is no build step and no server code.

**It will not work from `file://`.** Browsers block `fetch` of local files,
so opening `index.html` by double-clicking shows a load error. To try it
locally, serve the folder:

    cd sword-forge
    python3 -m http.server 8000
    # then open http://localhost:8000

## Enable compression

`assets/data/bible.json` is about 4.5 MB uncompressed and roughly 1.3 MB
gzipped, so turning on compression matters more than anything else here.
Most hosts do it automatically. For nginx:

    gzip on;
    gzip_types application/json application/javascript text/css;

## Files

    index.html                 shell
    assets/styles.css          styling
    assets/app.js              all behaviour
    assets/data/meta.json      books, eras, facts, study sheets
    assets/data/bible.json     the scripture text
    assets/icon.svg            icon, vector source
    assets/icons/              png icons and favicon
    manifest.webmanifest       makes it installable
    sw.js                      offline cache

## Read aloud

Two engines. Device voices work offline everywhere. The neural voice is
Kokoro-82M (Apache-2.0) loaded from a CDN on demand — about 86 MB, fetched
once, then cached by the browser. It needs HTTPS and a connection the first
time. If it fails the app falls back to the device voice and says so.

## Offline

`sw.js` caches the shell and the scripture after the first visit, so the app
opens without a connection. Service workers need HTTPS (or localhost).
When you change any file, bump `CACHE` in `sw.js` or returning visitors keep
the old version.

## Sources

King James Bible and Josephus's *Antiquities* (tr. Whiston) from Project
Gutenberg. The Apocrypha is set from an 1800 Cambridge printing scanned by
the Internet Archive and read by OCR — the wording is faithful, but about
one verse division in nine is merged with its neighbour where the scan lost
a numeral. All sources are in the public domain.
