/**
 * Renders the social preview card and the touch icon.
 *
 *   node tools/make-og.mjs
 *
 * Uses the Chromium that is already installed for testing. Output goes to
 * public/ and is committed, so a deploy never depends on this running.
 */
import { chromium } from 'playwright-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const OUT = path.resolve('public')

const MARK = fs.readFileSync(path.resolve('public/logo.svg'), 'utf8').replace(/currentColor/g, '#c8a24a')

const card = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@600&family=Cinzel:wght@700&display=swap">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#131211;color:#e9e5dc;
    font-family:Barlow,sans-serif;display:flex;flex-direction:column;
    justify-content:space-between;padding:64px 70px;position:relative;overflow:hidden}
  .rule{position:absolute;inset:24px;border:1px solid #2e2b27;border-radius:6px;pointer-events:none}
  .top{display:flex;align-items:center;gap:16px}
  .top svg{width:46px;height:46px}
  .brand{font-family:Cinzel,serif;font-weight:700;font-size:25px;letter-spacing:.11em;
    text-transform:uppercase;color:#e9e5dc}
  h1{font-size:69px;line-height:1.03;letter-spacing:-.028em;font-weight:600;max-width:17ch}
  h1 b{color:#c8a24a;font-weight:600}
  .sub{font-size:25px;color:#b3ada1;margin-top:18px;max-width:44ch;line-height:1.35}
  .strip{display:flex;gap:3px;margin-top:34px}
  .strip i{flex:1 1 0;display:block}
  .strip i b{display:block;height:13px;background:#c8a24a;opacity:.85}
  .strip i s{display:block;height:13px;background:#6c9bc4;opacity:.42}
  .foot{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
  .stats{display:flex;gap:34px}
  .stat{display:flex;flex-direction:column;gap:2px}
  .stat b{font-size:29px;font-weight:600;color:#e9e5dc;font-variant-numeric:tabular-nums}
  .stat span{font-family:'Barlow Semi Condensed',sans-serif;font-size:14px;font-weight:600;
    letter-spacing:.13em;text-transform:uppercase;color:#81796c}
  .tag{font-family:'Barlow Semi Condensed',sans-serif;font-size:15px;font-weight:600;
    letter-spacing:.13em;text-transform:uppercase;color:#81796c;text-align:right}
</style>
<div class="rule"></div>
<div>
  <div class="top">${MARK}<span class="brand">Dawnwalker Guide</span></div>
  <div style="margin-top:44px">
    <h1>You have <b>480 segments</b>. Spend them well.</h1>
    <p class="sub">A run planner and database for The Blood of Dawnwalker.</p>
    <div class="strip">${'<i><b></b><s></s></i>'.repeat(30)}</div>
  </div>
</div>
<div class="foot">
  <div class="stats">
    <div class="stat"><b>93</b><span>Quests</span></div>
    <div class="stat"><b>80</b><span>Items</span></div>
    <div class="stat"><b>41</b><span>Court acts</span></div>
    <div class="stat"><b>7</b><span>Endings</span></div>
  </div>
  <div class="tag">Every figure sourced<br>and confidence-rated</div>
</div>`

/** Sized per call — a fixed body would just be cropped at a smaller viewport. */
const touch = (size) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px;background:#131211;
display:flex;align-items:center;justify-content:center}
svg{width:${Math.round(size * 0.66)}px;height:${Math.round(size * 0.66)}px}</style>
${MARK}`

const browser = await chromium.launch({ executablePath: CHROME })

const shoot = async (html, w, h, file) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(OUT, file) })
  await ctx.close()
  console.log(`  ${file}  ${w}×${h}`)
}

await shoot(card, 1200, 630, 'og.png')
await shoot(touch(180), 180, 180, 'apple-touch-icon.png')
await shoot(touch(512), 512, 512, 'icon-512.png')
await shoot(touch(32), 32, 32, 'favicon-32.png')

await browser.close()
console.log('done — regenerate with: node tools/make-og.mjs')
