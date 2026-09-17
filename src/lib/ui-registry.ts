/**
 * Every string the interface can say, and every label it can put on a stored
 * value — in one file, with no imports, so anything can read it: the server,
 * a client component, the seeder that fills the admin table, and the launch
 * check that looks for overrides pointing at keys nobody kept.
 *
 * ## Why a registry rather than defaults at the call site
 *
 * `t('search.empty', 'Nothing matched')` looks tidier and is worse. The
 * default then exists in exactly one place — inside a component — which means
 * the admin has no way to list what can be changed, the seeder has nothing to
 * write into the table, and two components that should say the same thing
 * drift apart with nothing to compare them against. That last one is not
 * hypothetical here: achievement rarity labels were declared three times, and
 * the region danger enum is spelled `late` in one file and `late-run` in
 * another, which has been rendering an unlabelled badge for as long as both
 * have existed.
 *
 * So: the key is the contract, the text here is the default, and an override
 * row in Site settings → Interface text wins over it.
 *
 * ## Adding one
 *
 * Add the key here with the wording you want, then use it. Keys are
 * `area.thing`, lower case, and are never reused for a different sentence —
 * an override somebody wrote against a key is attached to its meaning, not to
 * its position on a page.
 *
 * Exactly two segments, always: one area before the dot, one hyphenated thing
 * after it. That is the same shape as a label key (`group.stored-value`), so a
 * sort puts every string for an area together in the admin table and a third
 * dot never has to mean anything.
 *
 * ## Tokens and markup
 *
 * A sentence that needs a number carries `{count}` and the call site runs it
 * through `fill` from `src/lib/copy.ts`. Numbers are never baked in, for the
 * reason that file gives: a typed-in count goes wrong the week somebody adds a
 * record, and this is the site whose whole pitch is that its numbers are real.
 *
 * Where a number or a link sits inside a sentence, it is not in the string —
 * the registry holds the words either side of it. An editable string that
 * reaches the DOM as markup is the stored-XSS hole the attribution template
 * already refuses to be, and that rule does not get an exception for a `<b>`.
 */

/** Interface text, keyed `area.thing`. */
export const UI_DEFAULTS: Record<string, string> = {
  /* Shared by every form, so the wording cannot drift between them. */
  'form.sending': 'Sending…',
  'form.cancel': 'Cancel',

  /*
    The two summary placeholders were written when there was one wiki, and name
    a Dawnwalker quest and a Dawnwalker feature to readers of all eight. Same
    failure as the hardcoded section copy: a sentence about the game, served on
    every game. They are worded for any wiki now, and an editor who wants a
    game-specific example can write one per site.
  */
  'correction.summary-label': 'What is wrong?',
  'correction.summary-placeholder': 'e.g. this figure is wrong, and here is the right one',
  'correction.detail-label': 'Any detail you can give',
  'correction.source-label': 'Source, if you have one',
  'correction.source-placeholder': 'https://',
  'correction.submit': 'Send correction',
  'correction.sent-title': 'Thank you — that is in the queue',
  'correction.sent-body':
    'We read every report. If it checks out, the page is corrected and the confidence rating goes up with it.',
  'correction.sent-again': 'Report something else',
  'correction.error': 'That did not send: {error}. Try again in a moment.',

  'request.kind-label': 'What kind of thing is this?',
  'request.summary-label': 'What would you like?',
  'request.summary-placeholder': 'e.g. let me filter a table by more than one thing at once',
  'request.detail-label': 'Any detail that would help',
  'request.detail-placeholder': 'What you were trying to do, and what got in the way.',
  'request.email-label': 'Your email, if you want a reply',
  'request.email-placeholder': 'Optional',
  'request.email-note':
    'Only used to reply about this request. Never added to a list and never passed on.',
  'request.submit': 'Send request',
  'request.sent-title': 'Thank you — that is on the list',
  'request.sent-body':
    'Every request is read. The ones asked for most often get built first, which is the only fair way to order a queue when there is more to do than time to do it in.',
  'request.sent-again': 'Ask for something else',
  'request.error': 'That did not send — {error}. Try again, or email us instead.',

  'comments.heading': 'Comments',
  'comments.sort-newest': 'Newest first',
  'comments.sort-oldest': 'Oldest first',
  'comments.rule':
    'Every comment is read by an editor before it appears, so yours will not show up straight away. Links are removed automatically — if you have a source, describe where it is and we will find it.',
  'comments.sent-title': 'Thank you — that is with a moderator',
  'comments.sent-body':
    'It will appear once an editor has read it. We approve by hand, which is slower and is the reason this section is worth reading.',
  'comments.sent-again': 'Write another',
  'comments.replying-to': 'Replying to',
  'comments.body-placeholder': 'Corrections, things we have missed, or what happened on your run.',
  'comments.reply-placeholder': 'Your reply…',
  'comments.name-placeholder': 'Your name (optional)',
  'comments.post': 'Post comment',
  'comments.post-reply': 'Post reply',
  'comments.reply': 'Reply',
  'comments.loading': 'Loading…',
  'comments.empty': 'Nothing here yet. Be the first.',
  /* Not a placeholder — it is the byline printed when nobody gave a name. */
  'comments.anonymous': 'Anonymous',
  'comments.just-now': 'just now',

  'account.checking': 'Checking…',
  'account.signed-in': 'Signed in',
  'account.signed-in-note': '{email}. Your run now follows you between devices.',
  'account.position': 'Position',
  'account.segments-left': 'Segments left',
  'account.quests-done': 'Quests done',
  'account.syncing': 'Syncing…',
  'account.saved': 'Saved. Changes sync automatically.',
  'account.open-checker': 'Open the run checker',
  'account.sign-out': 'Sign out',
  'account.delete-heading': 'Delete this account',
  'account.delete-warning':
    'This removes your email and your saved run from the server for good. Your run stays in this browser — signing out does not wipe it.',
  'account.delete-confirm': 'Yes, delete it permanently',
  'account.deleting': 'Deleting…',
  'account.delete-start': 'Delete account and saved run',
  'account.sign-in': 'Sign in',
  'account.register': 'Create an account',
  'account.need-account': 'Need an account?',
  'account.have-account': 'Already have one?',
  'account.optional-note':
    'You do not need this. Everything on the site works signed out, with your run kept in this browser. An account exists only so the same run opens on your phone and your desktop.',
  'account.email-label': 'Email',
  'account.password-label': 'Password',
  'account.password-hint': 'At least 8 characters.',
  'account.working': 'Working…',
  'account.create': 'Create account',
  'account.privacy-note': 'We store your email and your run. Nothing else. See the',
  'account.privacy-link': 'privacy policy',
  /*
    What a reader sees when the account API says no, or says nothing. Registry
    strings rather than literals thrown from a fetch, so the wording can be
    softened without touching the request that produced it.
  */
  'account.error-generic': 'That did not work.',
  'account.error-signin': 'Those details did not work.',
  'account.error-register': 'Could not create that account.',
  'account.error-delete': 'Could not delete the account.',
  'account.error-network': 'Could not reach the server. Try again in a moment.',
  'account.error-signed-out': 'Not signed in.',

  'search.label': 'Search the database',
  'search.placeholder': 'A quest, an item, a perk, a character…',
  'search.hero-placeholder': 'Search quests, items, perks, characters…',
  'search.failed': 'The search index could not be loaded. Try the section pages instead.',
  'search.loading': 'Loading the index…',
  'search.prompt': '{count} records indexed. Type at least two characters.',
  'search.match-one': '{count} match',
  'search.match-many': '{count} matches',
  'search.no-match':
    'Nothing matches “{query}”. It may simply not be documented yet — the database is honest about its gaps rather than filling them in.',
  'search.hero-no-match':
    'Nothing matches “{query}”. It may simply not be documented yet — this database is honest about its gaps rather than filling them in.',

  'table.search-placeholder': 'Search…',
  'table.noun': 'results',
  /*
    The matched count is bold and sits immediately before this, so the string is
    the tail of the sentence rather than all of it. See the note on markup at
    the top of this file.
  */
  'table.count': 'of {total} {noun}',
  'table.facet-any': '{label}: any',
  'table.reset': 'Reset',
  'table.empty': 'Nothing matches that.',
  'table.clear-filters': 'Clear the filters',
  'table.empty-tail': 'to see all {total}.',
  'table.unknown': 'unknown',
  'table.unknown-title': 'No source publishes this figure',

  'related.see-all': 'see all',

  'neighbours.more': 'More {label}',
  'neighbours.previous': 'Previous',
  'neighbours.next': 'Next',
  'neighbours.all': 'all {count}',

  'facts.title': 'At a glance',
  /*
    What a fact panel prints where a value is absent *because* there is nothing
    to print rather than because nobody recorded it. This one read "found
    across the vale" — the vale being Vale Sangora — on the enemy pages of all
    eight wikis, so a Gears of War drone was found across a valley in a
    different game.
  */
  'facts.region-unrecorded': 'unrecorded',
  'facts.region-everywhere': 'not tied to one region',

  /*
    The infobox heading. "Dawnwalker at a glance" said what the box was and
    nothing about what the game is; a reader arriving from a search result
    wants the second. Two keys rather than one with an optional token, because
    `fill` leaves an unfilled token visible on purpose and "Dawnwalker (video
    game, {year})" is worse than no year at all.
  */
  'profile.title': '{game}',
  'profile.title-dated': '{game} (video game, {year})',
  'profile.developer': 'Developer',
  'profile.publisher': 'Publisher',
  'profile.released': 'Released',
  'profile.release-unconfirmed': ' (not confirmed)',
  'profile.price': 'Price',
  'profile.free': 'Free to play',
  'profile.microtransactions': 'In-app purchases',
  'profile.microtransactions-value': 'Yes, per the store listing',
  'profile.editions': 'Editions',
  'profile.dlc': 'DLC and add-ons',
  'profile.modes': 'Modes',
  'profile.players': 'Players',
  'profile.internet': 'Internet',
  'profile.platforms': 'Platforms',
  'profile.engine': 'Engine',
  'profile.series': 'Series',
  'profile.genre': 'Genre',
  'profile.director': 'Director',
  'profile.designer': 'Designer',
  'profile.artist': 'Artist',
  'profile.writer': 'Writer',
  'profile.composer': 'Composer',
  'profile.metacritic': 'Metacritic',
  'profile.budget': 'Budget',
  'profile.marketing': 'Marketing spend',
  'profile.team-size': 'Team size',
  'profile.undisclosed':
    'Development budget, marketing spend and team size are not published for this game. Where a studio or publisher states one on the record, it will appear here with its source.',

  'run.where-heading': 'Where are you?',
  'run.where-note':
    'Your journal shows the day. Segments only advance on actions marked with an hourglass, so this is a budget, not a clock.',
  'run.day-label': 'Day',
  'run.phase-label': 'Phase',
  'run.into-label': 'Segments into phase',
  'run.budget-aria': '{spent} of {total} segments spent',
  'run.spent': 'spent',
  'run.left': 'left',
  'run.done-heading': 'What have you finished?',
  'run.reset': 'Reset run',
  'run.done-note':
    'Ticked here or on any quest page — it is the same run either way, kept in this browser.',
  'run.filter-label': 'Filter quests',
  'run.filter-placeholder': 'Start typing a quest name',
  'run.cost-unconfirmed': 'cost unconfirmed',
  'run.segments': '{count} segments',
  'run.no-quest-match': 'No quest matches that.',
  'run.next-heading': 'What you can start right now',
  'run.either-phase': 'Either phase',
  'run.next-note':
    'Prerequisites met, and playable during the {phase}. Everything else needs either another quest finished first or the other phase.',
  'run.next-empty':
    'Nothing in an ending chain is startable in this phase. Switch to {phase} above, or finish a prerequisite first.',
  'run.results-heading': 'What is still reachable',
  'run.locked-out-detail': 'Closed by {quests}. No amount of remaining time reopens it.',
  'run.failure-detail': 'Reached by overrunning the thirty days. Nothing can bar it.',
  'run.no-prep-detail':
    'Needs no advance preparation. Decided at the finale, so it stays open as long as you get there.',
  'run.achieved-detail': 'Everything this ending needs is already done.',
  'run.quests-left-one': '{count} quest left',
  'run.quests-left-many': '{count} quests left',
  'run.unconfirmed-one': ', of which {count} has no confirmed cost',
  'run.unconfirmed-many': ', of which {count} have no confirmed cost',
  'run.cost-of-yours': ' · {cost} segments of your {left}',
  'run.whats-left': 'What is left',
  'run.floor-title': 'Read these as a floor, not a verdict',
  'run.floor-body':
    'Reliable per-quest segment costs are not published anywhere we trust, so the checker counts what it knows and tells you what it does not. The prerequisite and lock-out logic is sound. The arithmetic is only as good as the costs behind it.',
  'run.floor-link': 'Send us real numbers',
  'run.floor-tail': 'and this sharpens for everyone.',

  'run.reading': 'Reading your run…',
  'run.stat-of': 'of {total}',
  /* The dashboard's own labels. They read the same as the account panel's today
     and are keyed separately, because they are two different screens and an
     editor shortening one should not shorten the other. */
  'run.segments-left-label': 'Segments left',
  'run.quests-done-label': 'Quests done',
  'run.daytime': 'Daytime',
  'run.nighttime': 'Night',
  'run.stat-spent': '{spent} spent of {total}',
  'run.stat-catalogued': 'of {total} catalogued',
  'run.stat-endings-open': 'Endings open',
  'run.stat-secured': '{count} already secured',
  'run.stat-closed': '{count} closed off',
  'run.nothing-tracked-title': 'Nothing tracked yet',
  'run.nothing-tracked-body':
    'Tick a quest anywhere on the site and it appears here. Nothing is sent anywhere — it lives in this browser until you decide otherwise.',
  'run.do-next': 'Do this next',
  'run.cheapest-route': 'cheapest route still open',
  'run.first-step': 'first outstanding step towards',
  'run.every-ending': 'Every ending, from here',
  'run.routes': '{count} routes',
  'run.all-required-done': 'Every required quest is done.',
  'run.closed-by': 'Closed by',
  'run.no-questline': 'No source records a required questline for this one yet.',
  'run.left-of-chain': '{left} of {total} quests left',
  'run.at-least': 'at least ',
  'run.no-published-cost': '{count} with no published cost',
  'run.start-by': 'start by day {day}',
  'run.clear-run': 'Clear this run',
  'run.clear-run-note': '— removes every tick and puts the clock back to day 1.',

  'run.badge-title': 'Your run',
  'run.badge-day': 'Day',
  'run.badge-left': 'left',

  'outlook.heading': 'Where your run stands',
  'outlook.eyebrow': 'Day {day} · {left} segments left',
  'outlook.reach': 'You can still reach',
  'outlook.of': 'of {total}',
  'outlook.tight': 'of them with no room for detours',
  'outlook.gone-one': 'is gone.',
  'outlook.gone-many': 'are gone.',
  'outlook.failure-state': 'Failure state',
  'outlook.failure-title': 'Reached by running out of days, not by choosing it',
  'outlook.some-uncosted': ', some uncosted',
  'outlook.segments': ' · {count} segments',
  'outlook.based-on': 'Based on the run in your browser.',
  'outlook.dashboard-link': 'Open the dashboard',
  'outlook.dashboard-tail': 'for what to do next, or',
  'outlook.checker-link': 'change what you have finished',

  'unlock.heading': 'How to unlock this',
  'unlock.empty-note': 'Nothing has to happen first — this is open from the start of the run.',
  'unlock.closed-title': 'Closed for this run',
  'unlock.closed-before': 'You marked',
  'unlock.closed-after':
    'as done, and it permanently locks this route out. No amount of time left changes that — it is a different playthrough, not a longer one.',
  'unlock.done-count': '{done} of {total} done',
  /*
    "1 quest stand between" is the wording that shipped, and the sentence went
    on to say "They have to happen in this order" about a single quest. The
    pass that lifted these into the registry deliberately changed no wording,
    so it was left alone then and corrected here, on its own.
  */
  'unlock.stand-between-one':
    '{count} quest stands between the start of a run and this one.',
  'unlock.stand-between-many':
    '{count} quests stand between the start of a run and this one. They have to happen in this order.',
  'unlock.done-in-run': 'Done in your run.',
  'unlock.next': 'Next:',
  'unlock.mark-done': 'Mark as done',
  'unlock.mark-not-done': 'Mark as not done',
  'unlock.cost-unpublished': 'cost unpublished',
  'unlock.nothing-to-pay': 'Nothing left to pay for.',
  'unlock.left': '{span} left.',
  'unlock.no-total-one':
    'No source publishes a cost for any of the {count} remaining step, so there is no total to give — only that there are {count} of them.',
  'unlock.no-total-many':
    'No source publishes a cost for any of the {count} remaining steps, so there is no total to give — only that there are {count} of them.',
  'unlock.floor-one':
    'At least {span}, plus {count} step nobody has published a cost for. Treat it as a floor, not a total.',
  'unlock.floor-many':
    'At least {span}, plus {count} steps nobody has published a cost for. Treat it as a floor, not a total.',
  'unlock.unaffordable': ' That is more than you have left in this run.',

  'quest.done': 'Done in your run',
  'quest.mark-done': 'Mark as done',
  'quest.done-sub': '{title} counts as finished everywhere on the site',
  'quest.not-done-sub': 'Saved in this browser — no account needed',

  'spoiler.label': 'Spoiler',
  'spoiler.reveal': '— click to reveal',
  'spoiler.setting': 'Hide story spoilers until I click them',

  'planner.no-perks': 'No perks recorded for this tree yet.',
  'planner.ultimate': 'Ultimate',
  'planner.segment-one': '{count} segment',
  'planner.segment-many': '{count} segments',
  'planner.cost-unconfirmed': 'cost unconfirmed',
  'planner.found-in-world': 'found in the world, not bought',
  'planner.replaces-ultimate': 'replaces your current ultimate',
  'planner.your-build': 'Your build',
  'planner.nothing-picked': 'Nothing picked yet. Tick perks on the left and this fills in.',
  'planner.perks': 'Perks',
  'planner.segments': 'Segments',
  'planner.ultimates': 'Ultimates',
  'planner.no-total':
    'No source publishes a segment cost for any of these, so we cannot total them. Reporting puts most skills at about one segment each, which would make this roughly {count} — treat that as a rule of thumb, not a figure.',
  'planner.floor-one':
    '{known} segments confirmed, with {count} perk whose cost nobody publishes. The total is a floor.',
  'planner.floor-many':
    '{known} segments confirmed, with {count} perks whose cost nobody publishes. The total is a floor.',
  'planner.spent': 'That is {known} of your 480 segments spent on perks rather than quests.',
  'planner.copy': 'Copy share link',
  'planner.copied': 'Link copied',
  'planner.clear': 'Clear',

  'tracker.still-to-do': 'Still to do ({count})',
  'tracker.hardest-left': 'Hardest left',
  'tracker.hidden': 'Hidden',
  'tracker.earned': 'Earned ({count})',
  'tracker.all': 'All',
  'tracker.earned-of': '{done} of {total} earned',
  'tracker.effort': 'of the effort, weighted by rarity',
  'tracker.hardest-one-left': 'Hardest one left',
  'tracker.have-it': '{percent}% of players have it',
  'tracker.two-figures':
    'Two figures, because they answer different questions. The first is the count. The second weights every achievement by how few players have it, so finishing the last handful of ultra-rares moves it a long way and mopping up commons barely moves it at all — which is what the work actually feels like.',
  'tracker.search-label': 'Search achievements',
  'tracker.search-placeholder': 'Search by name or description…',
  'tracker.all-done': 'Every one of them. Nothing left.',
  'tracker.no-match': 'Nothing matches that.',
  'tracker.hidden-desc': 'Hidden — the game does not say what it wants',
  'tracker.local-note':
    'Kept in this browser only. Nothing is sent anywhere and there is no account — which also means clearing your site data clears this.',

  'map.found-progress': '{found} / {total} found',
  'map.hide-found': 'Hide found',
  'map.zoom-in': 'Zoom in',
  'map.zoom-out': 'Zoom out',
  'map.reset-view': 'Reset the view',
  'map.close': 'Close',
  'map.open-page': 'Open its page',
  'map.mark-found': 'Mark as found',
  'map.position-from': 'Position from {source}',
  'map.help':
    'Drag to move, scroll to zoom, click a pin for what is there. What you tick off is kept in this browser only — there is no account behind it and nothing is sent anywhere.',
}

/**
 * Labels for stored enum values, keyed `group.value`.
 *
 * The group is the enum, not the page: one `rarity` map serves the item index,
 * the item page and any table that grows a rarity column, which is the whole
 * reason this table exists. A `RARITY_LABEL` const per file is how the
 * achievement rarities came to be declared three times.
 *
 * A value with no row here is not a bug — `fromMaps.label` tidies it and shows
 * it. The values are data, and a wiki can invent one at any time.
 */
export const LABEL_DEFAULTS: Record<string, string> = {
  /*
    The stored value is `late`: it is what `Regions.ts` offers, what
    `payload-types.ts` declares, and what every seeded region carries. The
    region detail page keys its own map `late-run`, which matches nothing, so
    those regions print a bare "late" in their fact panel while the index
    beside them says "Late run".
  */
  'danger.starting': 'Starting area',
  'danger.moderate': 'Moderate',
  'danger.dangerous': 'Dangerous',
  'danger.late': 'Late run',

  /*
    Item rarity renders lower case, because the badge is the word itself rather
    than a heading — that is how it shipped, and capitalising it here would
    restyle every item table on eight wikis. Achievement rarity is a different
    enum, with different values and its own capitalised wording, so it gets its
    own group rather than colliding on `common` and `rare`.
  */
  'rarity.legendary': 'legendary',
  'rarity.rare': 'rare',
  'rarity.common': 'common',

  'achievement-rarity.common': 'Common',
  'achievement-rarity.uncommon': 'Uncommon',
  'achievement-rarity.rare': 'Rare',
  'achievement-rarity.very-rare': 'Very rare',
  'achievement-rarity.ultra-rare': 'Ultra rare',

  'confidence.high': 'high',
  'confidence.medium': 'medium',
  'confidence.low': 'low',

  /* The badge's tooltip, keyed by the value it explains so the two cannot drift. */
  'confidence-why.high': 'Agreed by multiple independent sources',
  'confidence-why.medium': 'One good source, or minor disagreement between sources',
  'confidence-why.low': 'Contested, inferred, or not yet confirmed anywhere we trust',

  'phase.either': 'Any time',
  'phase.day': 'Day',
  'phase.night': 'Night',

  /* The same enum in running text rather than on a badge. */
  'phase-lower.day': 'day',
  'phase-lower.night': 'night',

  /* And again on a quest's own line, where it reads as a restriction. */
  'quest-phase.either': 'Day or night',
  'quest-phase.day': 'day only',
  'quest-phase.night': 'night only',

  'quest-kind.prologue': 'Prologue',
  'quest-kind.main': 'Main',
  'quest-kind.ally': 'Ally questline',
  'quest-kind.court': 'Court activity',
  'quest-kind.side': 'Side',
  'quest-kind.contract': 'Contract',

  /*
    `STATUS_LABELS` stays declared in `src/lib/reachability.ts`, which is kept
    free of anything server-side so the checker can be unit-tested without a
    database and shipped to the browser. The callers resolve the label through
    this group instead, so the words are editable without that file growing an
    import it must not have.
  */
  'ending-status.achieved': 'Already secured',
  'ending-status.reachable': 'Still reachable',
  'ending-status.tight': 'Tight — no room for detours',
  'ending-status.out-of-time': 'Out of time',
  'ending-status.locked-out': 'Locked out',

  'ending-gate.ally': 'Gated by an ally questline',
  'ending-gate.choice': 'Decided at the finale',
  'ending-gate.clock': 'Decided by the clock',

  'playstyle.day': 'Day',
  'playstyle.night': 'Night',
  'playstyle.hybrid': 'Hybrid',

  'acquisition.world': 'Fixed location',
  'acquisition.quest-reward': 'Quest reward',
  'acquisition.merchant': 'Merchant',
  'acquisition.drop': 'Enemy drop',
  'acquisition.gathered': 'Across the map',
  'acquisition.crafted': 'Crafted',

  /* The fuller phrasing for the item's own page, where there is room for one. */
  'acquisition-why.world': 'Found at a fixed spot in the world.',
  'acquisition-why.quest-reward': 'Handed over for finishing a quest, so it has no world location.',
  'acquisition-why.merchant': 'Bought from a merchant rather than found.',
  'acquisition-why.drop': 'Taken from something you kill.',
  'acquisition-why.gathered': 'Gathered across the map rather than in one place.',
  'acquisition-why.crafted': 'Made rather than found.',

  'role.protagonist': 'Protagonist',
  'role.ally': 'Ally',
  'role.vassal': 'Vassal',
  'role.antagonist': 'Antagonist',
  'role.merchant': 'Merchant',
  'role.minor': 'Minor',

  'mode.single-player': 'Single-player',
  'mode.multiplayer': 'Multiplayer',
  'mode.co-op': 'Co-op',
  'mode.online-co-op': 'Online co-op',
  'mode.pvp': 'PvP',
  'mode.online-pvp': 'Online PvP',
  'mode.cross-platform': 'Cross-platform',

  'online.no': 'Not required — plays offline',
  'online.multiplayer': 'Only for multiplayer',
  'online.yes': 'Always online',

  'request-kind.feature': 'A new feature or tool',
  'request-kind.data': 'Data we are missing',
  'request-kind.guide': 'A guide you want written',
  'request-kind.usability': 'Something that is hard to use',
  'request-kind.bug': 'Something is broken',
  'request-kind.other': 'Something else',

  /* The rail's own wording, keyed by the collection each entry points at. */
  'section.quests': 'Quests',
  'section.court-activities': 'Court Activities',
  'section.endings': 'Endings',
  'section.achievements': 'Achievements',
  'section.regions': 'Regions',
  'section.courts': 'The Court',
  'section.characters': 'Characters',
  'section.enemies': 'Enemies',
  'section.skill-trees': 'Skill trees',
  'section.perks': 'Perks',
  'section.items': 'Items',
  'section.builds': 'Builds',
  'section.mechanics': 'Mechanics',
  'section.guides': 'Guides',
  'section.maps': 'Maps',

  /* Singular, for one record: the type label beside a search result. */
  'kind.quests': 'Quest',
  'kind.court-activities': 'Court activity',
  'kind.endings': 'Ending',
  'kind.achievements': 'Achievement',
  'kind.regions': 'Region',
  'kind.courts': 'Court',
  'kind.characters': 'Character',
  'kind.enemies': 'Enemy',
  'kind.skill-trees': 'Skill tree',
  'kind.perks': 'Perk',
  'kind.items': 'Item',
  'kind.builds': 'Build',
  'kind.mechanics': 'Mechanic',
  'kind.guides': 'Guide',
  'kind.maps': 'Map',
}

/**
 * Every default in one group, as the plain `Record` an older call site expects.
 *
 * Overrides are **not** in it. They are read asynchronously from the global and
 * these callers index a map synchronously, so what this gives back is the
 * shipped wording and nothing an editor has typed. It exists so the words still
 * live in exactly one file while those call sites are converted — the failure it
 * prevents is a second copy of the map drifting from this one, which is how the
 * achievement rarities came to be declared three times. Anything that can reach
 * a `Ui` should call `ui.label` and get the editor's version.
 */
export const labelGroup = (group: string): Record<string, string> => {
  const prefix = `${group}.`
  const map: Record<string, string> = {}
  for (const [key, text] of Object.entries(LABEL_DEFAULTS)) {
    if (key.startsWith(prefix)) map[key.slice(prefix.length)] = text
  }
  return map
}

/** Resolve one key against an override map, then the registry, then itself. */
export const resolve = (
  key: string,
  overrides: Record<string, string> | undefined,
  defaults: Record<string, string>,
): string => {
  const override = overrides?.[key]
  if (typeof override === 'string' && override.trim() !== '') return override
  const fallback = defaults[key]
  if (typeof fallback === 'string' && fallback !== '') return fallback
  /*
    The key itself, visibly. An unknown key is a bug in the code rather than a
    gap in the content, and a blank button says nothing about which one — the
    same reason `fill()` leaves an unknown token where it was typed.
  */
  return key
}

export type UiMaps = { strings: Record<string, string>; labels: Record<string, string> }

export type Ui = {
  t: (key: string) => string
  label: (group: string, value: string | null | undefined, fallback?: string) => string
}

/**
 * The two maps as the object every call site actually uses.
 *
 * It lives in this file rather than beside the server read for one reason: half
 * these strings are in client components, so this function is imported by a
 * `'use client'` module, and everything such a module can reach is bundled for
 * the browser. `src/lib/ui.ts` reaches Payload through `client()`. Keeping the
 * resolver in the file with no imports is what stops the CMS being shipped to a
 * reader in order to render the word "Reset". `ui.ts` re-exports it, so server
 * callers can carry on importing it from there.
 */
export const fromMaps = (maps: UiMaps): Ui => ({
  t: (key) => resolve(key, maps.strings, UI_DEFAULTS),
  label: (group, value, fallback) => {
    if (!value) return fallback ?? ''
    const key = `${group}.${value}`
    const found = resolve(key, maps.labels, LABEL_DEFAULTS)
    /*
      An enum value nobody has written a label for reads better as itself,
      tidied, than as `danger.late-run`. This is the one place a missing key is
      not a bug worth shouting about: the values are data, and a wiki can
      invent one at any time.
    */
    return found === key ? (fallback ?? value.replace(/-/g, ' ')) : found
  },
})

/**
 * Rows to a map — keeping only the ones that actually differ.
 *
 * `pnpm seed:copy` writes a row for every key in the registry, so an editor
 * scrolls a list of real sentences instead of empty boxes. That is the right
 * thing for the admin and the wrong thing for the wire: these maps are handed
 * to the browser through `UiStringsProvider`, and without this filter every
 * page on the network carried all 387 strings inline in its HTML — including
 * the build planner's wording on a wiki with no build planner. It was
 * measurable the moment it shipped: a grep for Dawnwalker's clock found "480
 * segments" in the source of a Gears of War regions page, in the serialised
 * props.
 *
 * The defaults are already in the client bundle, once, cached across the whole
 * site, because the registry has no imports and client components read it
 * directly. So a row equal to its default carries no information and is
 * dropped. On a database nobody has edited, both maps are empty and the
 * provider ships `{}`.
 */
export const overridesOnly = (
  rows: { key?: string | null; text?: string | null }[] | null | undefined,
  defaults: Record<string, string>,
) => {
  const map: Record<string, string> = {}
  for (const row of rows ?? []) {
    if (!row?.key || typeof row.text !== 'string' || row.text.trim() === '') continue
    if (row.text === defaults[row.key]) continue
    map[row.key] = row.text
  }
  return map
}
