/*
 * Dawnwalker Guide — page image grabber
 *
 * Paste into the DevTools console on a page with images. It finds them, lets
 * you drop the junk, name the keepers, and downloads one zip laid out as
 * assets/<collection>/<slug>.<ext> — which is exactly what `pnpm assets`
 * expects, so the zip unpacks straight into the project.
 *
 * A manifest.json goes in the zip recording the source URL and page for every
 * file, so attribution survives the trip.
 *
 * Best used on an official press kit or a Steam store page, where the art is
 * published for this. Everything else is your call; see docs/ASSETS.md.
 *
 * Zipping is done here in the page (stored, no compression — images are
 * already compressed), so nothing is uploaded anywhere.
 */
(() => {
  const ID = '__dw_grab__'
  document.getElementById(ID)?.remove()
  document.getElementById(ID + 'css')?.remove()

  const COLLECTIONS = [
    'items', 'characters', 'perks', 'quests', 'endings', 'regions',
    'enemies', 'builds', 'courts', 'court-activities', 'skills', 'site',
  ]

  const slugify = (v) =>
    String(v || '').toLowerCase().trim()
      .replace(/\.(png|jpe?g|webp|avif|gif)$/i, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70)

  const extOf = (url) => {
    const m = String(url).split('?')[0].split('#')[0].match(/\.(png|jpe?g|webp|avif|gif)$/i)
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png'
  }

  // ---- CRC32, for the zip entries -------------------------------------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c >>> 0
    }
    return t
  })()
  const crc32 = (bytes) => {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  /**
   * Minimal ZIP writer, stored method only. Images do not compress, so this
   * costs nothing and saves pulling a library onto a page whose CSP may well
   * refuse it.
   */
  function makeZip(files) {
    const enc = new TextEncoder()
    const chunks = []
    const central = []
    let offset = 0

    const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
    const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
    const push = (arr) => { chunks.push(arr); offset += arr.length }

    for (const file of files) {
      const nameBytes = enc.encode(file.name)
      const data = file.data
      const crc = crc32(data)
      const localOffset = offset

      push(u32(0x04034b50))          // local file header
      push(u16(20)); push(u16(0))    // version, flags
      push(u16(0))                   // stored
      push(u16(0)); push(u16(0x0021)) // time, date (1980-01-01, the format's epoch)
      push(u32(crc)); push(u32(data.length)); push(u32(data.length))
      push(u16(nameBytes.length)); push(u16(0))
      push(nameBytes)
      push(data)

      const c = []
      const cpush = (a) => c.push(a)
      cpush(u32(0x02014b50))
      cpush(u16(20)); cpush(u16(20)); cpush(u16(0))
      cpush(u16(0))
      cpush(u16(0)); cpush(u16(0x0021))
      cpush(u32(crc)); cpush(u32(data.length)); cpush(u32(data.length))
      cpush(u16(nameBytes.length)); cpush(u16(0)); cpush(u16(0))
      cpush(u16(0)); cpush(u16(0)); cpush(u32(0))
      cpush(u32(localOffset))
      cpush(nameBytes)
      central.push(c)
    }

    const centralStart = offset
    for (const c of central) for (const a of c) push(a)
    const centralSize = offset - centralStart

    push(u32(0x06054b50))
    push(u16(0)); push(u16(0))
    push(u16(files.length)); push(u16(files.length))
    push(u32(centralSize)); push(u32(centralStart))
    push(u16(0))

    let total = 0
    for (const a of chunks) total += a.length
    const out = new Uint8Array(total)
    let p = 0
    for (const a of chunks) { out.set(a, p); p += a.length }
    return new Blob([out], { type: 'application/zip' })
  }

  // ---- find the images -------------------------------------------------
  function collect() {
    const found = new Map()
    const add = (url, w, h, hint, linked) => {
      if (!url || url.startsWith('data:')) return
      let abs
      try { abs = new URL(url, location.href).href } catch { return }
      if (!/\.(png|jpe?g|webp|avif|gif)(\?|#|$)/i.test(abs)) return
      const existing = found.get(abs)
      if (existing) {
        if (w * h > existing.w * existing.h) { existing.w = w; existing.h = h }
        if (!existing.hint && hint) existing.hint = hint
        existing.linked = existing.linked || Boolean(linked)
        return
      }
      found.set(abs, { url: abs, w, h, hint: hint || '', linked: Boolean(linked) })
    }

    for (const img of document.querySelectorAll('img')) {
      // Prefer the largest srcset candidate over the rendered one.
      let best = img.currentSrc || img.src
      if (img.srcset) {
        const cands = img.srcset.split(',').map((s) => s.trim().split(/\s+/))
        let bw = 0
        for (const [u, d] of cands) {
          const width = d && d.endsWith('w') ? parseInt(d) : 0
          if (width >= bw) { bw = width; best = u }
        }
      }
      const hint = img.alt || img.title || img.closest('figure')?.querySelector('figcaption')?.textContent || ''
      add(best, img.naturalWidth || img.width, img.naturalHeight || img.height, hint.trim())

      // An image wrapped in a link to a bigger file — common on wikis and
      // press pages, and always the one you actually want.
      const a = img.closest('a[href]')
      if (a && /\.(png|jpe?g|webp|avif|gif)(\?|#|$)/i.test(a.href) && a.href !== best) {
        add(a.href, 0, 0, hint.trim(), true)
      }
    }

    for (const el of document.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage
      if (bg && bg !== 'none') {
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
        if (m) add(m[1], el.clientWidth, el.clientHeight, el.getAttribute('aria-label') || '')
      }
    }

    for (const a of document.querySelectorAll('a[href]')) {
      if (/\.(png|jpe?g|webp|avif|gif)(\?|#|$)/i.test(a.href)) add(a.href, 0, 0, a.textContent.trim(), true)
    }

    // Linked full-size files first, then by rendered area.
    return [...found.values()].sort(
      (a, b) => Number(b.linked) - Number(a.linked) || b.w * b.h - a.w * a.h,
    )
  }

  // ---- UI --------------------------------------------------------------
  const style = document.createElement('style')
  style.id = ID + 'css'
  style.textContent = `
    #${ID}{position:fixed;inset:16px;z-index:2147483647;background:#141311;color:#e9e5dc;
      border:1px solid #3a3631;border-radius:8px;display:flex;flex-direction:column;
      font:13px/1.45 system-ui,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.6)}
    #${ID} *{box-sizing:border-box;font-family:inherit}
    #${ID} header{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;
      border-bottom:1px solid #3a3631;background:#1c1a17}
    #${ID} h2{margin:0;font-size:14px;font-weight:600;margin-right:auto}
    #${ID} .grid{flex:1;overflow:auto;padding:12px;display:grid;
      grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;align-content:start}
    #${ID} .it{border:1px solid #35312c;border-radius:6px;background:#1b1917;padding:8px;
      display:flex;flex-direction:column;gap:6px}
    #${ID} .it[data-on="0"]{opacity:.4}
    #${ID} .ph{height:96px;background:#0e0d0c;border-radius:4px;display:flex;align-items:center;
      justify-content:center;overflow:hidden}
    #${ID} .ph img{max-width:100%;max-height:100%;object-fit:contain}
    #${ID} .meta{font-size:11px;color:#8b8478;display:flex;justify-content:space-between;gap:6px}
    #${ID} input[type=text],#${ID} select{width:100%;font:inherit;font-size:12px;padding:3px 6px;
      border-radius:4px;border:1px solid #454039;background:#0e0d0c;color:#e9e5dc}
    #${ID} button{font:inherit;cursor:pointer;border-radius:5px;border:1px solid #4a443c;
      background:#2a2622;color:#e9e5dc;padding:6px 11px}
    #${ID} button.go{background:#c8a24a;border-color:#c8a24a;color:#141311;font-weight:600}
    #${ID} button:disabled{opacity:.5;cursor:default}
    #${ID} label.top{font-size:11px;color:#8b8478;display:flex;align-items:center;gap:5px}
    #${ID} footer{padding:9px 14px;border-top:1px solid #3a3631;background:#1c1a17;
      display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    #${ID} .status{font-size:12px;color:#8b8478;margin-right:auto}
    #${ID} .warn{color:#d59b8f}
  `
  document.head.appendChild(style)

  let items = collect()
  const state = items.map((it) => ({
    ...it,
    on: true,
    name: slugify(it.hint) || slugify(it.url.split('/').pop()) || 'image',
    coll: 'items',
  }))

  const panel = document.createElement('div')
  panel.id = ID
  panel.innerHTML = `
    <header>
      <h2>Grab images — ${state.length} found</h2>
      <label class="top">Min width
        <input id="dwMin" type="number" value="200" min="0" step="50" style="width:72px">
      </label>
      <label class="top">Set all to
        <select id="dwAllColl" style="width:140px">${COLLECTIONS.map((c) => `<option>${c}</option>`).join('')}</select>
      </label>
      <button id="dwAll">Select all</button>
      <button id="dwNone">Select none</button>
      <button id="dwClose">✕</button>
    </header>
    <div class="grid" id="dwGrid"></div>
    <footer>
      <span class="status" id="dwStatus">Untick anything you do not want. Names become the filename, so they must match the record slug.</span>
      <button class="go" id="dwZip">Download zip</button>
    </footer>`
  document.body.appendChild(panel)

  const grid = panel.querySelector('#dwGrid')
  const status = panel.querySelector('#dwStatus')

  function render() {
    const min = parseInt(panel.querySelector('#dwMin').value, 10) || 0
    grid.innerHTML = ''
    state.forEach((s, i) => {
      if (s.w && s.w < min) return
      const el = document.createElement('div')
      el.className = 'it'
      el.dataset.on = s.on ? '1' : '0'
      el.innerHTML = `
        <div class="ph"><img src="${s.url}" loading="lazy" referrerpolicy="no-referrer"></div>
        <div class="meta">
          <label class="top"><input type="checkbox" data-i="${i}" class="ck" ${s.on ? 'checked' : ''}> keep</label>
          <span>${s.linked ? 'full size' : `${s.w || '?'}×${s.h || '?'}`}</span>
        </div>
        <select class="cl" data-i="${i}">${COLLECTIONS.map((c) => `<option${c === s.coll ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <input type="text" class="nm" data-i="${i}" value="${s.name}" spellcheck="false">`
      grid.appendChild(el)
    })
    grid.querySelectorAll('.ck').forEach((c) => {
      c.onchange = (e) => { state[+e.target.dataset.i].on = e.target.checked; e.target.closest('.it').dataset.on = e.target.checked ? '1' : '0' }
    })
    grid.querySelectorAll('.nm').forEach((n) => {
      n.onchange = (e) => { state[+e.target.dataset.i].name = slugify(e.target.value); e.target.value = state[+e.target.dataset.i].name }
    })
    grid.querySelectorAll('.cl').forEach((n) => {
      n.onchange = (e) => { state[+e.target.dataset.i].coll = e.target.value }
    })
    const visible = state.filter((s) => !s.w || s.w >= min).length
    status.textContent = `${visible} shown, ${state.filter((s) => s.on).length} ticked. Names become filenames, so they must match the record slug.`
  }

  panel.querySelector('#dwMin').oninput = render
  panel.querySelector('#dwAll').onclick = () => { state.forEach((s) => (s.on = true)); render() }
  panel.querySelector('#dwNone').onclick = () => { state.forEach((s) => (s.on = false)); render() }
  panel.querySelector('#dwAllColl').onchange = (e) => { state.forEach((s) => (s.coll = e.target.value)); render() }
  panel.querySelector('#dwClose').onclick = () => { panel.remove(); style.remove() }

  panel.querySelector('#dwZip').onclick = async () => {
    const chosen = state.filter((s) => s.on)
    if (chosen.length === 0) { status.textContent = 'Nothing ticked.'; return }
    const btn = panel.querySelector('#dwZip')
    btn.disabled = true

    const files = []
    const manifest = []
    const failed = []
    const used = new Set()

    for (let i = 0; i < chosen.length; i++) {
      const s = chosen[i]
      status.textContent = `Fetching ${i + 1} of ${chosen.length}…`
      try {
        const res = await fetch(s.url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const buf = new Uint8Array(await res.arrayBuffer())
        let name = `${s.coll}/${s.name}.${extOf(s.url)}`
        let n = 2
        while (used.has(name)) name = `${s.coll}/${s.name}-${n++}.${extOf(s.url)}`
        used.add(name)
        files.push({ name, data: buf })
        manifest.push({ file: name, source: s.url, page: location.href, pageTitle: document.title, grabbed: new Date().toISOString().slice(0, 10), bytes: buf.length })
      } catch (err) {
        failed.push({ url: s.url, reason: String(err.message || err) })
      }
    }

    if (files.length === 0) {
      status.innerHTML = `<span class="warn">Every fetch failed — the site is blocking cross-origin reads. Save these manually, or try from the image's own URL in a tab.</span>`
      btn.disabled = false
      return
    }

    manifest.sort((a, b) => a.file.localeCompare(b.file))
    files.push({
      name: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify({
        grabbedFrom: location.href,
        pageTitle: document.title,
        grabbed: new Date().toISOString(),
        note: 'Source URLs kept for attribution. See docs/ASSETS.md before publishing any of these.',
        files: manifest,
        failed,
      }, null, 2)),
    })

    const blob = makeZip(files)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dawnwalker-assets-${slugify(location.hostname)}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)

    status.innerHTML = `Zipped ${files.length - 1} image${files.length === 2 ? '' : 's'} (${(blob.size / 1048576).toFixed(1)} MB).` +
      (failed.length ? ` <span class="warn">${failed.length} failed — listed in manifest.json.</span>` : '')
    btn.disabled = false
    console.log('[dawnwalker] zipped', files.length - 1, 'images;', failed.length, 'failed', failed)
  }

  render()
  console.log('[dawnwalker] image grabber ready —', state.length, 'candidates')
})()
