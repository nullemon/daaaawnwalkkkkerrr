/**
 * Pulls everything a publisher's own store page states about a game.
 *
 *   node tools/fetch-game-data.mjs            # fetch and write JSON
 *   node tools/fetch-game-data.mjs --art      # also download the art
 *
 * ## Why Steam, and why only Steam
 *
 * Every wiki on this network opens on the same problem: the game is not out,
 * or is a fortnight old, and nobody has played it enough to write a
 * walkthrough. The temptation is to write one anyway from trailers and
 * previews. That is how every other new wiki starts and it is exactly what
 * this network is supposed to not be.
 *
 * What a publisher's store page states is different: it is first-party, dated,
 * and citable. Release date, editions, what is in each edition, system
 * requirements, supported languages, controller support, DLC, content
 * descriptors, the achievement list once the game ships. Dozens of facts per
 * game that readers genuinely search for, none of them invented.
 *
 * So this fetches those, and the seed turns them into pages that each cite the
 * store page they came from. Nothing here writes prose about how a game plays.
 *
 * ## What it saves
 *
 *   src/seed/raw/games/<slug>.json   the facts, for the seed to read
 *   assets/_games/<slug>/            header, capsule, background, screenshots
 *
 * Re-running is safe: JSON is overwritten, art is skipped if already present.
 */
import fs from 'fs'
import path from 'path'

import { harvestText } from '../src/lib/text-encoding-table.mjs'

const WANT_ART = process.argv.includes('--art')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/**
 * Every wiki, with the Steam app id it was verified against. The id is the
 * load-bearing part — a title search returns demos, soundtracks and playtests,
 * and picking the wrong one silently attributes another product's facts to
 * this game.
 *
 * Dawnwalker was not on this list for most of the project's life, and the
 * reason is worth keeping: it had no store listing to read. It shipped on
 * 3 September 2026 and the listing went up with it, which is the case
 * CLAUDE.md describes as the plan rather than an afterthought — the week a
 * game launches, the pipeline that was empty starts answering. Its achievement
 * list with per-achievement global unlock rates is the part that could not
 * exist before release at all.
 */
const GAMES = [
  { slug: 'dawnwalker', appId: 3751260 },
  { slug: 'onimusha-way-of-the-sword', appId: 2638890 },
  { slug: 'phantom-blade-zero', appId: 4115450 },
  { slug: 'control-resonant', appId: 3669870 },
  { slug: 'gears-of-war-e-day', appId: 3010850 },
  { slug: 'star-wars-zero-company', appId: 2075800 },
  { slug: 'resonance-a-plague-tale-legacy', appId: 2713000 },
  { slug: 'silent-hill-townfall', appId: 1636440 },

  /*
    The second wave, added after the first eight shipped.

    Each id was verified against the store API before it was written down —
    name, type, developer and publisher read back and checked against what the
    game actually is. That is the whole reason this list holds ids rather than
    titles: a title search returns the demo, the soundtrack, the playtest and
    the season pass, and picking the wrong one attributes another product's
    requirements, editions and achievements to this game with nothing
    anywhere saying so.

    Four of these five are out, so their achievement lists carry a global
    unlock rate per achievement and `completion-tracker` earns its place on
    each. Deadlock is Valve's, listed and playable but with no announced date,
    so it has requirements and no achievements — the same shape the four
    unreleased wikis of the first wave have.

    **Two games in this wave are not here and cannot be**: Grand Theft Auto VI
    has no Steam listing at all (no PC version is announced, so there is no
    page to read), and Fire Emblem: Fortune's Weave is a Switch exclusive that
    will never have one. Their wikis are built from Wikipedia, their community
    wikis and search demand, and every store-derived section on them is a gap
    the pages state rather than fill.
  */
  { slug: 'resident-evil-requiem', appId: 3764200 },
  { slug: 'subnautica-2', appId: 1962700 },
  { slug: 'forza-horizon-6', appId: 2483190 },
  { slug: 'nba-2k27', appId: 4356430 },
  { slug: 'deadlock', appId: 1422450 },
]

const OUT_DIR = path.resolve('src/seed/raw/games')
const ART_DIR = path.resolve('assets/_games')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getJson = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json()
}

/**
 * Store descriptions are HTML. We keep the text only — the prose is ours.
 *
 * The entity decoding was six `replace` calls here, which is five names short
 * of what a Steam listing writes: `&rsquo;`, `&hellip;`, `&ndash;`, `&mdash;`,
 * `&trade;` and `&reg;` are all over storefront copy and none of them was
 * handled. So it comes from the one table in
 * `src/lib/text-encoding-table.mjs`, which is the same table the detector in
 * `src/lib/text-encoding.ts` reports against — a second copy drifts, and a
 * drifted repair table writes faults in rather than out.
 *
 * After the tags, not before: decoding first would turn `&lt;b&gt;` into a tag
 * the next pass strips, which silently deletes whatever the source had put
 * between angle brackets on purpose.
 */
const stripHtml = (value) =>
  harvestText(
    String(value ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6])>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

/**
 * System requirements arrive as one HTML blob with <strong>Label:</strong>
 * value pairs. Split into rows so the page can render a table rather than a
 * paragraph nobody reads.
 */
const parseRequirements = (html) => {
  if (!html) return []
  const rows = []
  for (const match of String(html).matchAll(
    /<strong>([^<]+?):?\s*<\/strong>\s*([^<]*(?:<br>)?)/gi,
  )) {
    const label = stripHtml(match[1]).replace(/:$/, '').trim()
    const value = stripHtml(match[2]).trim()
    if (label && value && !/minimum|recommended/i.test(label)) rows.push({ label, value })
  }
  return rows
}

/**
 * The public achievement list, with each one's global unlock rate.
 *
 * `ISteamUserStats/GetSchemaForGame` needs an API key; this community page
 * does not, and carries the same names, descriptions and icons plus the
 * percentage of owners who have it — which is the thing a reader actually
 * wants, because "0.4% of players have this" is what makes an achievement
 * worth a page.
 *
 * Absent for a game that has not shipped, which is not an error but the
 * answer: there is nothing to document yet.
 *
 * Note `class="achieveRow "` — with a trailing space. Matching the class
 * attribute exactly returned zero rows from a page containing fifty-two of
 * them, silently, which is the whole hazard of scraping by regex.
 */
const fetchAchievements = async (appId) => {
  const response = await fetch(`https://steamcommunity.com/stats/${appId}/achievements/`, {
    headers: { 'User-Agent': UA },
  })
  if (!response.ok) return []

  const html = await response.text()

  /*
    Split into row blocks first, then read each field out of its own block.

    The previous version was one regular expression spanning the whole row,
    with the percentage in an optional group. It never matched: the `[\s\S]*?`
    before the group is lazy, so it skipped straight past the percentage to
    something that satisfied the rest of the pattern, and the optional group
    then matched nothing. Fifty-two achievements imported with a null rarity
    each, no error anywhere, and the single most useful field on the page
    silently absent.

    Splitting first removes the ambiguity entirely — each field is found in a
    block that contains exactly one of it.
  */
  const blocks = html.split(/<div class="achieveRow/).slice(1)
  const achievements = []

  for (const block of blocks) {
    const title = stripHtml((block.match(/<h3>([\s\S]*?)<\/h3>/) ?? [])[1] ?? '')
    if (!title) continue

    const description = stripHtml((block.match(/<h5>([\s\S]*?)<\/h5>/) ?? [])[1] ?? '')
    const icon = (block.match(/<img[^>]+src="([^"]+)"/) ?? [])[1] ?? null
    const percent = (block.match(/<div class="achievePercent">\s*([\d.]+)\s*%/) ?? [])[1]

    achievements.push({
      title,
      description: description || null,
      icon,
      globalPercent: percent ? Number(percent) : null,
    })
  }

  return achievements
}

const download = async (url, file) => {
  if (fs.existsSync(file)) return 'skipped'
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!response.ok) return `HTTP ${response.status}`
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
  return 'saved'
}

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const { slug, appId } of GAMES) {
  process.stdout.write(`\n${slug} (${appId})\n`)

  const payload = await getJson(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&cc=us`,
  )
  const entry = payload[String(appId)]
  if (!entry?.success) {
    console.error('  no store data — skipped')
    continue
  }

  const app = entry.data
  const achievements = await fetchAchievements(appId)

  const record = {
    slug,
    appId,
    storeUrl: `https://store.steampowered.com/app/${appId}/`,
    fetchedAt: new Date().toISOString().slice(0, 10),

    title: app.name,
    developers: app.developers ?? [],
    publishers: app.publishers ?? [],
    releaseDate: app.release_date?.date ?? null,
    comingSoon: Boolean(app.release_date?.coming_soon),

    shortDescription: stripHtml(app.short_description),
    // Kept for reference only. Never rendered — the prose on this site is ours.
    aboutText: stripHtml(app.about_the_game).slice(0, 4000),

    genres: (app.genres ?? []).map((genre) => genre.description),
    categories: (app.categories ?? []).map((category) => category.description),
    languages: stripHtml(app.supported_languages).replace(/\*.*$/s, '').trim(),
    contentDescriptors: app.content_descriptors?.notes
      ? stripHtml(app.content_descriptors.notes)
      : null,

    platforms: Object.entries(app.platforms ?? {})
      .filter(([, supported]) => supported)
      .map(([name]) => name),

    requirements: {
      minimum: parseRequirements(app.pc_requirements?.minimum),
      recommended: parseRequirements(app.pc_requirements?.recommended),
    },

    editions: (app.package_groups ?? []).flatMap((group) =>
      (group.subs ?? []).map((sub) => ({
        title: stripHtml(sub.option_text).replace(/\s*-\s*\$[\d.,]+.*$/, '').trim(),
        priceText: (stripHtml(sub.option_text).match(/\$[\d.,]+/) ?? [null])[0],
      })),
    ),

    dlc: app.dlc ?? [],
    /*
      `app.metacritic` is deliberately not captured. This network publishes its
      own rating per game and that is the only score a reader should meet, so a
      third party's number is not harvested at all rather than harvested and
      then hidden — a field sitting in the raw JSON is one somebody wires back
      into a page a year from now without knowing why it was there.
    */
    achievements,

    art: {
      header: app.header_image ?? null,
      capsule: app.capsule_image ?? null,
      background: app.background_raw ?? app.background ?? null,
      screenshots: (app.screenshots ?? []).map((shot) => shot.path_full).slice(0, 12),
    },
  }

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), `${JSON.stringify(record, null, 2)}\n`)

  console.log(`  ${record.title}`)
  console.log(`  release ${record.releaseDate}${record.comingSoon ? ' (upcoming)' : ''}`)
  console.log(`  ${record.genres.length} genres, ${record.categories.length} categories`)
  console.log(
    `  ${record.requirements.minimum.length} min / ${record.requirements.recommended.length} rec requirement rows`,
  )
  console.log(`  ${record.editions.length} editions, ${record.dlc.length} DLC`)
  console.log(`  ${record.achievements.length} achievements`)
  console.log(`  ${record.art.screenshots.length} screenshots`)

  if (WANT_ART) {
    const dir = path.join(ART_DIR, slug)
    fs.mkdirSync(dir, { recursive: true })

    const jobs = [
      [record.art.header, 'header.jpg'],
      [record.art.capsule, 'capsule.jpg'],
      [record.art.background, 'background.jpg'],
      ...record.art.screenshots.map((url, index) => [
        url,
        `screenshot-${String(index + 1).padStart(2, '0')}.jpg`,
      ]),
    ].filter(([url]) => url)

    let saved = 0
    for (const [url, name] of jobs) {
      const result = await download(url.split('?')[0], path.join(dir, name))
      if (result === 'saved') saved += 1
      await sleep(120)
    }
    console.log(`  art: ${saved} new of ${jobs.length} into assets/_games/${slug}/`)
  }

  // One request a second against a store that is doing us a favour.
  await sleep(1200)
}

console.log(`\nWrote ${GAMES.length} files to src/seed/raw/games/`)
if (!WANT_ART) console.log('Re-run with --art to download the images too.')
