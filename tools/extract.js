/*
 * Dawnwalker Guide — browser extractor
 *
 * Paste into the DevTools console on any page that has a table or a list of
 * links. Pick the table, map its columns onto our fields, download JSON that
 * drops straight into src/seed/raw/ and runs through `pnpm import`.
 *
 * It captures the page URL and today's date as the source on every record
 * automatically, because a record without a citation is rejected on import.
 *
 * Scope, deliberately: one page at a time, facts only, no images, no crawling.
 * Compiling facts is fine and is what this whole project does. Lifting a
 * substantial part of someone's database is a different thing — in the EU and
 * UK the sui generis database right covers that even when the contents are
 * pure fact — and copying their sentences is straightforwardly infringement.
 * Take the numbers, write your own words.
 */
(() => {
  const PANEL_ID = '__dw_extract__'
  document.getElementById(PANEL_ID)?.remove()

  const TODAY = new Date().toISOString().slice(0, 10)

  // Field sets mirror docs/RESEARCH-CONTRACT.md.
  const COMMON = ['— ignore —', 'title', 'summary', 'note']
  const SCHEMAS = {
    items: [...COMMON, 'category', 'rarity', 'regionSlug', 'howToGet', 'stat:label/value'],
    quests: [...COMMON, 'kind', 'regionSlug', 'courtSlug', 'phase', 'timeMin', 'timeMax'],
    perks: [...COMMON, 'treeSlug', 'effect', 'timeCostSegments', 'isUltimate'],
    characters: [...COMMON, 'role', 'regionSlug', 'romanceable'],
    enemies: [...COMMON, 'regionSlug', 'phase', 'isBoss', 'weaknesses'],
    'court-activities': [...COMMON, 'courtSlug', 'regionSlug', 'phase', 'howToStart'],
    regions: [...COMMON, 'dangerRating', 'courtSlug'],
    builds: [...COMMON, 'playstyle', 'primaryTreeSlug', 'difficulty'],
  }

  const slugify = (v) =>
    String(v).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

  const css = `
    #${PANEL_ID}{position:fixed;top:12px;right:12px;width:340px;max-height:92vh;overflow:auto;
      z-index:2147483647;background:#171614;color:#e9e5dc;border:1px solid #3a3631;border-radius:6px;
      font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)}
    #${PANEL_ID} *{box-sizing:border-box;font-family:inherit}
    #${PANEL_ID} header{display:flex;justify-content:space-between;align-items:center;gap:8px;
      padding:10px 12px;border-bottom:1px solid #3a3631;background:#1f1d1a;position:sticky;top:0}
    #${PANEL_ID} h2{margin:0;font-size:13px;font-weight:600;letter-spacing:.02em}
    #${PANEL_ID} .body{padding:12px;display:flex;flex-direction:column;gap:10px}
    #${PANEL_ID} button{font:inherit;cursor:pointer;border-radius:4px;border:1px solid #4a443c;
      background:#2a2622;color:#e9e5dc;padding:6px 10px}
    #${PANEL_ID} button.go{background:#c8a24a;border-color:#c8a24a;color:#171614;font-weight:600}
    #${PANEL_ID} button:disabled{opacity:.5;cursor:default}
    #${PANEL_ID} select,#${PANEL_ID} input{width:100%;font:inherit;padding:4px 6px;border-radius:4px;
      border:1px solid #4a443c;background:#100f0e;color:#e9e5dc}
    #${PANEL_ID} label{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8b8478;margin-bottom:3px}
    #${PANEL_ID} .row{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:end}
    #${PANEL_ID} .col{border-top:1px solid #2b2825;padding-top:7px}
    #${PANEL_ID} .col b{display:block;font-size:12px;color:#c8a24a;margin-bottom:3px;word-break:break-word}
    #${PANEL_ID} .hint{font-size:11.5px;color:#8b8478}
    #${PANEL_ID} .warn{font-size:11.5px;color:#d59b8f;border-left:2px solid #b4564a;padding-left:8px}
    .__dw_hi__{outline:2px solid #c8a24a !important;outline-offset:2px !important;cursor:pointer !important}
    .__dw_sel__{outline:2px solid #7fa36b !important;outline-offset:2px !important}
  `
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.innerHTML = `
    <header>
      <h2>Dawnwalker extractor</h2>
      <button id="dwClose" title="Close">✕</button>
    </header>
    <div class="body" id="dwBody"></div>`
  document.body.appendChild(panel)
  panel.querySelector('#dwClose').onclick = () => {
    cleanupPicking()
    panel.remove()
    style.remove()
  }
  const body = panel.querySelector('#dwBody')

  let picked = null
  let mode = 'table'

  // ---- step 1: pick a region of the page -------------------------------
  const candidates = () =>
    mode === 'table'
      ? [...document.querySelectorAll('table')]
      : [...document.querySelectorAll('ul, ol')].filter((l) => l.querySelectorAll('a[href]').length >= 4)

  const onOver = (e) => e.currentTarget.classList.add('__dw_hi__')
  const onOut = (e) => e.currentTarget.classList.remove('__dw_hi__')
  const onPick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    picked?.classList.remove('__dw_sel__')
    picked = e.currentTarget
    picked.classList.add('__dw_sel__')
    cleanupPicking()
    renderMap()
  }

  function startPicking() {
    for (const el of candidates()) {
      el.addEventListener('mouseover', onOver)
      el.addEventListener('mouseout', onOut)
      el.addEventListener('click', onPick, true)
    }
  }
  function cleanupPicking() {
    for (const el of candidates()) {
      el.classList.remove('__dw_hi__')
      el.removeEventListener('mouseover', onOver)
      el.removeEventListener('mouseout', onOut)
      el.removeEventListener('click', onPick, true)
    }
  }

  function renderPick() {
    const found = candidates().length
    body.innerHTML = `
      <div>
        <label>What are you extracting?</label>
        <select id="dwMode">
          <option value="table">A table of rows</option>
          <option value="list">A list of links (an index page)</option>
        </select>
      </div>
      <p class="hint">${found} candidate${found === 1 ? '' : 's'} on this page. Hover to highlight, click to choose.</p>
      ${found === 0 ? '<p class="warn">Nothing matched. Try the other mode.</p>' : ''}
      <p class="hint">Facts only. Don't copy sentences — write your own. Images aren't collected.</p>`
    body.querySelector('#dwMode').onchange = (e) => {
      cleanupPicking()
      mode = e.target.value
      renderPick()
    }
    startPicking()
  }

  // ---- step 2: map columns --------------------------------------------
  function tableRows(table) {
    const rows = [...table.querySelectorAll('tr')]
    if (rows.length === 0) return { headers: [], data: [] }
    const headCells = [...rows[0].querySelectorAll('th,td')].map((c) => clean(c.textContent))
    const looksLikeHeader = rows[0].querySelector('th') !== null
    const headers = looksLikeHeader ? headCells : headCells.map((_, i) => `Column ${i + 1}`)
    const dataRows = (looksLikeHeader ? rows.slice(1) : rows)
      .map((r) => [...r.querySelectorAll('td,th')].map((c) => clean(c.textContent)))
      .filter((cells) => cells.some((c) => c.length))
    return { headers, data: dataRows }
  }

  function renderMap() {
    const collection = 'items'
    if (mode === 'list') {
      const links = [...picked.querySelectorAll('a[href]')]
        .map((a) => ({ title: clean(a.textContent), href: a.href }))
        .filter((l) => l.title)
      body.innerHTML = `
        <p class="hint">${links.length} links found.</p>
        <div><label>Collection</label><select id="dwColl">${Object.keys(SCHEMAS)
          .map((c) => `<option>${c}</option>`)
          .join('')}</select></div>
        <p class="hint">Each link becomes a stub record: title, slug, and this page as the source. Fill in the detail afterwards, or visit each page and extract there.</p>
        <button class="go" id="dwGo">Build ${links.length} records</button>
        <button id="dwBack">← pick something else</button>`
      body.querySelector('#dwBack').onclick = () => { picked?.classList.remove('__dw_sel__'); picked = null; renderPick() }
      body.querySelector('#dwGo').onclick = () => {
        const coll = body.querySelector('#dwColl').value
        emit(coll, links.map((l) => base({ title: l.title })))
      }
      return
    }

    const { headers, data } = tableRows(picked)
    if (data.length === 0) {
      body.innerHTML = `<p class="warn">No data rows in that table.</p><button id="dwBack">← pick another</button>`
      body.querySelector('#dwBack').onclick = () => { picked?.classList.remove('__dw_sel__'); picked = null; renderPick() }
      return
    }

    const guess = (h) => {
      const k = h.toLowerCase()
      if (/name|item|quest|perk|title|activity/.test(k)) return 'title'
      if (/type|categ/.test(k)) return 'category'
      if (/rarit|tier|quality/.test(k)) return 'rarity'
      if (/region|location|area|where/.test(k)) return 'regionSlug'
      if (/effect|descr|notes?$/.test(k)) return 'summary'
      if (/court|vassal/.test(k)) return 'courtSlug'
      if (/tree/.test(k)) return 'treeSlug'
      if (/phase|time of day/.test(k)) return 'phase'
      if (/cost|segment|time/.test(k)) return 'timeMax'
      return '— ignore —'
    }

    body.innerHTML = `
      <p class="hint">${data.length} rows × ${headers.length} columns.</p>
      <div><label>Collection</label><select id="dwColl">${Object.keys(SCHEMAS)
        .map((c) => `<option${c === collection ? ' selected' : ''}>${c}</option>`)
        .join('')}</select></div>
      <div><label>Confidence for all rows</label><select id="dwConf">
        <option value="medium" selected>medium — one good source</option>
        <option value="high">high — corroborated elsewhere</option>
        <option value="low">low — contested or unsure</option>
      </select></div>
      <div id="dwCols"></div>
      <button class="go" id="dwGo">Build records</button>
      <button id="dwBack">← pick something else</button>`

    const cols = body.querySelector('#dwCols')
    const drawCols = () => {
      const fields = SCHEMAS[body.querySelector('#dwColl').value]
      cols.innerHTML = headers
        .map(
          (h, i) => `<div class="col"><b>${h || `Column ${i + 1}`}</b>
            <select data-i="${i}">${fields
              .map((f) => `<option value="${f}"${f === guess(h) ? ' selected' : ''}>${f}</option>`)
              .join('')}</select></div>`,
        )
        .join('')
    }
    drawCols()
    body.querySelector('#dwColl').onchange = drawCols
    body.querySelector('#dwBack').onclick = () => { picked?.classList.remove('__dw_sel__'); picked = null; renderPick() }

    body.querySelector('#dwGo').onclick = () => {
      const coll = body.querySelector('#dwColl').value
      const conf = body.querySelector('#dwConf').value
      const mapping = [...cols.querySelectorAll('select')].map((s) => s.value)
      if (!mapping.includes('title')) {
        alert('Map one column to "title" — records need a name to be addressable.')
        return
      }
      const records = data
        .map((cells) => {
          const rec = {}
          const stats = []
          cells.forEach((cell, i) => {
            const field = mapping[i]
            if (!field || field === '— ignore —' || !cell) return
            if (field === 'stat:label/value') {
              stats.push({ label: headers[i], value: cell })
              return
            }
            if (field === 'timeMin' || field === 'timeMax' || field === 'timeCostSegments') {
              const n = parseInt(cell.replace(/[^0-9-]/g, ''), 10)
              if (!Number.isNaN(n)) rec[field] = n
              return
            }
            if (field === 'isUltimate' || field === 'isBoss' || field === 'romanceable') {
              rec[field] = /^(yes|true|y|✓|✔)$/i.test(cell)
              return
            }
            if (field.endsWith('Slug')) { rec[field] = slugify(cell); return }
            rec[field] = cell
          })
          if (stats.length) rec.stats = stats
          return rec.title ? base(rec, conf) : null
        })
        .filter(Boolean)
      emit(coll, records)
    }
  }

  /** Every record leaves here addressable and cited — import rejects it otherwise. */
  function base(rec, confidence = 'medium') {
    const withTime = {}
    if (rec.timeMin !== undefined || rec.timeMax !== undefined) {
      const max = rec.timeMax ?? rec.timeMin
      const min = rec.timeMin ?? rec.timeMax
      withTime.timeSegments = { min, max, known: true }
    }
    delete rec.timeMin
    delete rec.timeMax
    return {
      slug: slugify(rec.title),
      ...rec,
      ...withTime,
      summary: rec.summary || `${rec.title}.`,
      confidence,
      sources: [{ title: document.title.slice(0, 160), url: location.href, retrieved: TODAY }],
    }
  }

  function emit(collection, records) {
    const seen = new Set()
    const deduped = records.filter((r) => (seen.has(r.slug) ? false : seen.add(r.slug)))
    const payload = { collection, records: deduped }
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const name = `${collection}-${slugify(location.hostname)}.json`

    body.innerHTML = `
      <p class="hint"><b>${deduped.length}</b> records ready${
        deduped.length !== records.length ? ` (${records.length - deduped.length} duplicate slugs dropped)` : ''
      }.</p>
      <a id="dwDl" href="${url}" download="${name}"><button class="go">Download ${name}</button></a>
      <button id="dwCopy">Copy JSON to clipboard</button>
      <p class="hint">Put it in <code>src/seed/raw/</code> and run <code>pnpm import</code>. Records missing a source or a title are rejected there.</p>
      <p class="hint">Check a few before importing — table scrapes pick up footnote markers and stray characters.</p>
      <button id="dwBack">← extract something else</button>`
    body.querySelector('#dwCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(json)
        body.querySelector('#dwCopy').textContent = 'Copied'
      } catch {
        body.querySelector('#dwCopy').textContent = 'Clipboard blocked — use Download'
      }
    }
    body.querySelector('#dwBack').onclick = () => { picked?.classList.remove('__dw_sel__'); picked = null; renderPick() }
    console.log('[dawnwalker] extracted', deduped.length, 'records for', collection, payload)
  }

  renderPick()
})()
