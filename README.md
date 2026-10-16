# NZ Road Code Master — Theory & Restricted Test Prep

An offline, standalone study app for the New Zealand **learner licence theory test** and for
preparing to drive solo on a **restricted licence**. 275 original questions, each with four
answer options and a separate explanation for every option, all cited to an official NZTA
Waka Kotahi or Drive page.

> **This is an independent study tool.** It is not produced, endorsed or approved by NZTA
> Waka Kotahi or the AA. The questions are original: they are not actual examination
> questions and are not reproductions of any official or commercial question bank.

---

## Run it

1. Open `nz-road-code-master.html` in Chrome or Safari — double-click it, or drag it onto the
   browser window.
2. That's all. There is no install, no server, no account, no network connection required and
   no data leaves your device.

The file is self-contained: HTML, CSS, JavaScript, all 275 questions, every explanation and
all 30 SVG diagrams are embedded in it. It works with the wifi off.

Progress is saved in your browser's local storage for that file. If you move the file to a
different folder or a different browser, use **Progress data → Export progress** first and
import the file on the other side.

---

## What's in it

**Dashboard.** Leads with **one** recommended action chosen from what you have actually done —
resume an unfinished exam, try five questions, fix what you got wrong, work a weak topic, or sit
the mock — each shown with its reason. Below that, an honest readiness signal with the figures
behind it, then the practice modes, then quiet links to statistics and settings. Every control
still works; they are just no longer all shouting at once.

**Exams.**

- **35-question theory mock** — full length, 30-minute timer, feedback at the end, scored
  against the published 32/35 benchmark.
- **Custom exam** — 10/20/35/50/all questions, any topic, any difficulty, question source
  (any / unattempted / previously wrong / bookmarked), immediate or end-of-exam feedback,
  timed or untimed, and either ruleset.
- **Weak topics**, **review incorrect**, **review bookmarks**, **road signs**, **hazard
  scenarios**, and the **restricted prep** module.

**One question at a time.** Nothing is revealed until you submit. In immediate-feedback mode
submitting locks your answer and shows the correct option, the underlying rule, a separate
explanation for every one of the four options, a real-world example and the official source
link. In end-of-exam mode nothing is marked until you submit the whole exam, and you can go
back and change any answer before you do.

**Results.** Score, correct/incorrect/unanswered, time taken, pass-or-below-benchmark for the
theory mock only, per-topic breakdown, suggested revision topics, and every question in the
exam with full explanations. Retry just the ones you got wrong, retake the same exam, start a
new mock, browse the bank, or go back to the dashboard.

**Study features.** Bookmarks, incorrect-answer review ordered by how often you have missed
each question, optional confidence rating, weak-topic analysis, a simple spaced-repetition
schedule, a searchable and filterable question browser with a "show answers" study mode, and
JSON export/import with validation.

**Two rulesets.** *Current rules*, and *From 25 January 2027* covering the confirmed
graduated driver licensing changes. Future rules are never applied to the current ruleset.

**Restricted Practical Test Preparation.** A separate module drawing on its own 35 questions,
plus every question tagged for observation, hazard anticipation and decision making — 137 in
all. It opens with a prominent notice that the restricted licence test is a practical on-road
assessment and that multiple-choice practice cannot establish driving competence or replace
supervised practice.

**Appearance.** Light, dark, or follow your device. The header button switches straight
between light and dark; Progress data → Appearance has all three options.

**Keyboard.** During an exam: `1`–`4` or `A`–`D` to select, `Enter` to submit or advance,
`←` `→` to move between questions, `B` to bookmark, `Esc` to close a dialog.

---

## Interaction design

The information architecture follows the UX principles set out in
[*10 Best UX Websites of 2026*](https://www.wandr.studio/blog/best-ux-websites) (Wandr),
adapted for a study tool rather than a commercial site.

| Principle from the article | How it is applied |
|---|---|
| "Let users explore and preview before requesting commitment" | A first-time visitor is offered **five real questions in one click** — no setup screen, no account, explanations as you go |
| "Design around primary user tasks, not internal structure" | The dashboard leads with **one** state-aware primary action instead of eleven equal tiles |
| "Reduce cognitive load at every step" | Controls are grouped into *do this next* → *practise* → *manage*, with housekeeping demoted to quiet text links |
| "Clear value proposition users grasp immediately" | A readiness signal sits above the fold, with the figures behind it |
| "Use interaction to communicate complex ideas quickly" | Readiness is derived from real performance rather than presented as raw counts |
| "Clarity beats cleverness every time" | The primary action states *why* it is being recommended |
| "Consistency to build familiarity" | One design system, one component set, unchanged |
| "Optimise for performance and accessibility as foundational" | Offline, no network, 142 contrast checks, reduced-motion support |

### The primary action

`suggestedNextStep()` in `src/core/stats.js` is pure and unit-tested. It picks, in order:

1. **Resume** — an unfinished exam always wins.
2. **Try five questions** — nothing answered yet.
3. **Fix what you got wrong** — five or more questions currently wrong.
4. **Work on your weakest topics** — a weak topic identified, with at least 20 attempts behind it.
5. **Sit the mock** — otherwise.

Each is shown with its reason and a quiet alternative, so the recommendation is never a dead end.

### Readiness is deliberately strict

`readiness()` under-claims rather than flatters, because this is safety education. It says
nothing at all until 35 questions have been answered, and reaches its top band only with
**≥60% coverage, ≥85% accuracy, and a completed full-length mock at or above the benchmark**.
It always shows the figures it is derived from, and always states that it is not a prediction
of the official result.

### What was deliberately not applied

Most of the sites in that article are commercial, and several of its principles are conversion
tactics that would be user-hostile here:

- **"Constant urgency signals"** and **"gamified incentives tied to spending"** (Temu).
  Manufactured urgency around road-safety content is worse than useless.
- **Sign-up funnel optimisation** and **"progressive engagement before sign-up"** (Preply).
  There is no account, no sign-up and no funnel.
- **"Encourages repeat visits"** via artificial hooks (GOAT). Spaced repetition already brings
  people back for a real reason.
- **Trust signals as persuasion** (Airbnb, GOAT). Trust here comes from citing the official
  source on every question, which was already the case.

---

## Design system

The interface follows the visual language of the **airsup.ai lab pages**
(<https://www.airsup.ai/lab/skill>), whose published stylesheet was read on 14 October 2026.
Its defining moves, all carried over here:

| Aspect | Treatment |
|---|---|
| Palette | Warm paper, not cool grey: page `#f3f2ee`, card `#fbfaf7`, ink `#141414`, hairline `#e2e0da` |
| Accent | **None.** Ink is the accent, so primary buttons are black and links are ink with an underline |
| Corners | **Square. Zero `border-radius` in the entire stylesheet** |
| Borders | 1px hairlines |
| Depth | Large, soft, almost invisible shadows rather than tight drop shadows |
| Sections | Opened by a heavy top rule rather than boxed inside a card |
| Type | **Not copied** — see below |

### Typography: a practice test, not an editorial page

The source site pairs a large display serif with Inter. That is wrong for a practice test, so
the typography is the one part of its system deliberately **not** adopted. This app uses
**one plain sans at assessment-appropriate sizes**:

| | Setting |
|---|---|
| Family | `Inter`, falling back to `system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, `Arial` |
| Question text | 20–23px, line-height **1.45**, over a **58-character** measure |
| Body and options | 17px, line-height **1.6** |
| Largest heading | 26–34px (it was 40–76px) |
| Score figure | 40–56px (it was 64–112px) |
| Tracking | Near-normal; the display face's −.02em has gone |

Inter is used because it was drawn for screen interfaces and keeps `1`/`l`/`I` and `0`/`O`
visually distinct — which matters when a question turns on "100 metres" or on an option
letter. It is **SIL Open Font License**, base64-embedded as woff2 by `tools/build.mjs` rather
than linked, because the app has to work from `file://` with no network. Latin subset of the
variable 400–600 slice: **47 KB raw / 64 KB base64**.

Provenance is recorded in `src/fonts/LICENSE.md`. Bundle tests assert the face is embedded as
a `data:` URI, that no Google Fonts reference survives the build, that no display serif is
referenced anywhere, and that the fallback stack reaches a standard sans.

> This is standard assessment-legibility practice, not a reproduction of the official test.
> NZTA does not publish the typeface used in its theory test, and the app does not claim to
> match it.

### What was adapted rather than copied

That site is a landing page with no dark mode and no success or error states. A study app
needs both:

- **Dark theme** is a warm inversion of the same palette — page `#141312`, ink `#f3f2ee` —
  rather than the usual cool charcoal, so the two themes read as one product.
- **Semantic colours** had to be introduced: a deep forest green `#2f5d3a` and an oxblood
  `#8c2f24`, desaturated to sit with warm neutrals instead of the usual saturated UI colours.
- **Display sizes** are a notch smaller than the original, topping out at 76px rather than
  104px, because this is an application you read for an hour rather than a hero section.

### Accessibility adjustments

Three published values fall below WCAG AA. They are adjusted for text and controls, and kept
exactly where they are only decorative:

| Token | As published | Measured on paper | Used here |
|---|---|---:|---|
| `--mute` | `#86847f` | 3.34:1 | `#6b6964` for text — 4.89:1 |
| `--faint` | `#c9c7c1` | 1.51:1 | `#89867e` for interactive borders — 3:1 |
| `--line` | `#e2e0da` | 1.18:1 | kept exactly; decorative hairlines only |

`tools/check-contrast.mjs` resolves the tokens straight out of `src/styles.css` and checks
**all 65 pairs in both themes — 130 checks** — so neither theme can regress without the build
failing.

### Dark mode

A **light theme, a dark theme, and a "follow system" option**.

- The **button in the header** switches straight between light and dark, labelled with what it
  will do (`☾ Dark` / `☀ Light`) rather than the state it is in — that is what a screen reader
  announces.
- **Progress data → Appearance** offers all three preferences.
- *Follow system* tracks your device live, without a reload. An explicit choice is remembered
  and ignores later system changes.
- A `prefers-color-scheme` block applies the dark palette **before** JavaScript runs, so there
  is no white flash on load. The contrast gate asserts it stays identical to the main dark
  theme.
- `@media print` forces the light palette back on, so printing from the dark theme does not
  put near-white text onto white paper.
- The preference is stored with your other settings and travels through export/import.

### Sign artwork is excluded from the theme

**The signs and diagrams in `src/ui/svg.js` keep their real colours in both themes** — red
Stop, blue Keep Left, amber traffic light, yellow warning diamonds. Re-tinting them to suit a
palette would make the teaching content wrong. Only the decorative roadside was warmed, from
`#e4ebe2` to `#e9e7e0`, so the illustrations sit with the paper.

### Not an official service

The header carries a permanent **"Independent study tool — not an official NZTA service"**
notice beside the ruleset, and the footer repeats the full disclaimer. There is no NZTA logo
anywhere in the app, and a render test asserts the notice is present.

---

## Working on the source

The deliverable is generated. Source lives in `src/`, tooling in `tools/`. Node 18+ is
needed to build; there are **no dependencies** to install.

```bash
node tools/validate.mjs        # question-bank gate: structure, sourcing, anti-pattern audit
node tools/validate.mjs --topic signs    # one topic at a time while authoring
node tools/check-contrast.mjs  # WCAG contrast gate over the colour tokens (--verbose to list)
node tools/test-core.mjs       # unit tests over src/core and the diagram registry
node tools/build.mjs           # inline everything into nz-road-code-master.html
node tools/test-bundle.mjs     # smoke-test the built file in a VM sandbox
node tools/test-render.mjs     # drive every screen against a minimal DOM shim
node tools/report.mjs          # regenerate docs/validation-report.md from real runs

npm run all                    # validate → contrast → unit test → build → smoke + render tests → report
```

`test-render.mjs` runs the built file against a hand-written DOM shim and walks it through
every screen and the whole exam lifecycle. It catches view-layer and controller errors, but
it is **not** a browser: it proves nothing about layout, styling, fonts or responsiveness.

| Path | What it is |
|---|---|
| `nz-road-code-master.html` | the deliverable (generated — do not edit by hand) |
| `src/core/` | DOM-free logic: schema, RNG, exam engine, stats, storage, import/export |
| `src/ui/` | DOM layer, views, and the inline SVG diagram registry |
| `src/questions/` | one file per topic, each owning a contiguous block of NZRC ids |
| `tools/letter-plan.json` | the pre-allocated balanced correct-answer letter for every id |
| `docs/validation-report.md` | generated report of what was actually tested |

Everything in `src/` is written as plain ES modules, so Node tests import exactly the code
that ships. The build strips the `import` lines and `export` keywords, concatenates in
dependency order inside one IIFE, and fails if two modules declare the same top-level name.

### Adding or updating a question

Edit the relevant `src/questions/NN-topic.js`, keeping the id inside that file's block. Set
`lastVerified` to the date you actually checked the source page, and `verified: false` with a
`verificationNote` if you could not confirm it — the app surfaces unverified questions in its
header. Then run `node tools/validate.mjs --topic <key>` and fix anything it flags before
rebuilding.

---

## Manual browser checklist

No browser was ever opened during this build. The view layer's **logic** is covered by
`tools/test-render.mjs`, but everything a rendering engine actually does — layout, styling,
fonts, focus, real key events, real file dialogs, real elapsed time — is unverified. Run
through the list below in Chrome and Safari after any change to `src/ui/`.

**Setup**

- [ ] Open `nz-road-code-master.html` directly from Finder (a `file://` URL, not a server).
- [ ] Turn wifi off and reload — everything should still work.

**Exams**

- [ ] Start the 35-question theory mock. Confirm 35 questions and a 30:00 timer counting down.
- [ ] Confirm no answer is revealed before you submit.
- [ ] In immediate-feedback mode, submit an answer and confirm the selection locks, the correct
      option is highlighted, and all four option explanations appear.
- [ ] In end-of-exam mode, confirm nothing is marked until final submit and that you can go
      back and change an answer.
- [ ] Leave a question blank, submit, and confirm the "unanswered questions" warning appears
      and that the blank is scored as incorrect.
- [ ] Let a timed exam run out and confirm it auto-submits and the timer never goes negative.
- [ ] Press Exit Exam and confirm the warning, and that an abandoned exam shows no pass result
      and does not appear in history.
- [ ] Refresh mid-exam and confirm the browser warns you, then that the dashboard offers to
      resume.

**Study features**

- [ ] Bookmark a question, then use Review bookmarks.
- [ ] Get a question wrong, then use Review incorrect answers.
- [ ] Browse questions, search by a word and by an id, toggle "show answers".
- [ ] Choose a filter combination that matches nothing and confirm the explanatory message.
- [ ] Ask for 50 questions from a topic that has 10 and confirm the shortfall warning.
- [ ] Switch to the 25 January 2027 ruleset and confirm NZRC-247, NZRC-248 and NZRC-249 show
      their updated answers, and that the header shows the new ruleset.

**Data**

- [ ] Export progress, reset everything, then import the file back and confirm it restores.
- [ ] Try importing an unrelated JSON file and confirm it is rejected with a clear message.
- [ ] Confirm Reset All Progress asks for confirmation first.

**Presentation**

- [ ] Check layout at roughly 360 px, 768 px and 1200 px wide.
- [ ] Complete a question using only the keyboard.
- [ ] Confirm the focus ring is visible on every control you tab to.
- [ ] Confirm each diagram renders and none shows "Diagram unavailable".
- [ ] Confirm the black header and footer render and the nav is readable against them.
- [ ] Confirm the question text reads as a sentence at a comfortable size, not as a headline.
- [ ] Confirm nothing on screen is set in a serif.
- [ ] Compare a question against a real practice test and check it feels equally plain.
- [ ] Confirm nothing has rounded corners.
- [ ] On a fresh profile (reset first), confirm the dashboard offers "Try five questions" and
      that clicking it goes straight into a question with no setup screen.
- [ ] Answer some questions wrongly, return to the dashboard, and confirm the recommendation
      changes to fixing those.
- [ ] Confirm there is exactly one filled button on the dashboard.
- [ ] Confirm the "Independent study tool" notice is visible in the header bar.
- [ ] Confirm sign artwork still shows its real colours (red Stop, blue Keep Left, amber light).
- [ ] Toggle dark mode from the header and confirm every screen is readable.
- [ ] Set Appearance to "Follow system", then flip macOS between light and dark and confirm
      the app follows without a reload.
- [ ] Choose Light or Dark explicitly, flip the OS, and confirm the app does NOT follow.
- [ ] Reload in dark mode and confirm there is no white flash before the app paints.
- [ ] Confirm diagrams still read clearly as figures against the dark page.

---

## Accuracy, sources and limits

Every question cites the official page and section it was written from, and the date that
page was checked. The bank was verified against NZTA Waka Kotahi and Drive on **14 October
2026**, which includes the 2026 edition of the Road Code and the lane-use changes that came
into force on 1 October 2026.

Road rules change. Re-check the official sources before relying on this app after any rule
change, and update `lastVerified` when you do.

- The **32 out of 35** benchmark reflects the published learner theory test requirement and is
  applied only to a completed full-length theory mock.
- The **25 January 2027 ruleset** models only the confirmed graduated driver licensing
  changes. It is not a complete future rulebook.
- The restricted licence test is a **practical on-road assessment**. No multiple-choice
  question can measure driving competence.

Full detail, including everything that was and was not tested, is in
[`docs/validation-report.md`](docs/validation-report.md).

Official Road Code: <https://www.nzta.govt.nz/driving-skills/learn-to-drive/roadcode>
