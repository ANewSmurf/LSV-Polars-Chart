# LSV TOXCct 6.1.9 — responsive redesign and interactive chart

## What changed

- Responsive layouts for desktop, tablet and mobile.
- Shared visual system across the Polars chart, CSV generator, help pages,
  release notes and contact form.
- Mobile-native race selector.
- Larger controls and clearer values for TWA and TWS.
- Optional fullscreen chart mode.
- Improved keyboard focus styles and reduced-motion support.
- Correct chart pointer coordinates when the canvas is visually scaled.
- Interactive Apache ECharts polar visualization, bundled locally.
- Tooltips, clearer current-performance marker and responsive chart resizing.
- TWS step buttons generated from `nbdigits`.
- Current TWA marker anchored to the outer semicircle while keeping the real speed in its label and tooltip.
- Focused zoom isolates the active sail curve and marks the actual polar point.
- A view selector in the chart header keeps the Performance curve as default and adds five views of the same polar: speed by TWA, VMG by TWA, best sail map (TWA × TWS), gap to the best sail and polars by TWS. The current TWA can be dragged in each of them, and every view except the best sail map zooms around the active point.
- The zoom magnifies the chart around the active point without distorting the polar: 0 kt stays at the origin, the speed rings and their labels follow the zoom, and the foil markers stay on the outer arc.
- In Speed by TWA, the curve is dashed with two colors where another sail allowed by the options stays within the sail change tolerance of the boat.
- The curves are drawn every 0.1° of TWA at every zoom level, and the TWA window narrows faster at high zoom levels.
- The Partners box sits under the Sails, and Reset Application at the bottom of the burger drawer.
- Only the fastest sail speed is in bold in the Sails panel, and the speeds follow the chosen number of decimals.
- Persistent light/night theme with automatic system-preference detection and a shared header toggle.
- ECharts axes, labels, markers and tooltips adapt live to the selected color theme.
- Help navigation and chart screenshots aligned with the modern interface.
- Desktop dashboard on three columns: boat options and sails on the left, polar
  chart centered in its panel, attitude, TWS and optimums on the right.
- TWS minus buttons on a first row and plus buttons on a second row.
- Help pages rewritten for the new layout, with day and night screenshots: the
  Help shows the night screenshots when the night theme is on, and the day
  screenshots otherwise.

## Compatibility

The existing DOM identifiers, calculation engine, data APIs, URL parameters
and browser storage format are preserved. The responsive styling is isolated in
`css/modern.css`, loaded after the historical stylesheets.

The main chart is rendered by Apache ECharts on a true 180° polar axis
(`startAngle: 90`, `endAngle: -90`). The historical 425 × 650 canvas
renderer is still loaded as a fallback if ECharts cannot initialize. Both
renderers expose the same application-facing API.

`nbdigits` now directly means the number of decimal places. For example,
`nbdigits=2` creates the steps `±1`, `±.1` and `±.01`; smaller steps are not
displayed. Values are clamped between 0 and 5 digits, and the setting is kept in
the race storage and permalink.

## Responsive layout

- Above 1080 px: one-screen dashboard on three columns. Boat options, sails and
  Reset are on the left, the chart fills the viewport height in the center, and
  the attitude, TWS and optimums are on the right. The page itself does not
  scroll. The race list and race information open in a drawer from the burger
  button or from the current race summary in the top bar; picking a race closes
  it.
- From 761 to 1080 px: the chart is centered above two control columns.
- Up to 760 px: the interface becomes a single column and race thumbnails are
  replaced by the native race selector.
- Up to 420 px: navigation and TWA controls are further condensed.
- When the page is opened with chart parameters (`race_id`, `twa`, `tws`) on a
  screen where it scrolls, it scrolls straight to the chart.

## Main files

- `css/modern.css`: shared design system and responsive rules.
- `js/modern_ui.js`: fullscreen chart behavior, desktop race drawer and initial
  scroll to the chart.
- `js/theme.js`: theme detection, persistence, synchronization and header toggle.
- `js/polars_echarts.js`: interactive ECharts renderer.
- `js/polars_chart.js`: historical canvas fallback.
- `js/help.js`: Help page navigation, and switch between the day screenshots
  (`help/img/`) and the night screenshots (`help/img/dark/`).
- `js/lib/echarts-6.1.0.min.js`: locally bundled Apache ECharts runtime.
- `js/lib/ECHARTS-LICENSE.txt`: Apache ECharts license.
- `index.htm`: new application shell and updated controls.

## Deployment

Deploy the contents of the `polars` directory as before. Keep the directory
structure intact because pages use relative links to CSS, JavaScript and image
assets.

## Languages

The interface is available in English and French. English stays the reference
language: its texts are written in the pages and in `locales/en.json`.

- `js/i18n.js` picks the language: the `lang` URL parameter (`?lang=fr`, kept for
  the tab), then the FR/EN button choice (kept in `localStorage`), then the
  browser language, then English. It loads `locales/en.json` and the chosen
  language's file, translates the page, then lets the applications start, so
  the texts they build (chart labels, tooltips, messages) use `I18n.t()`.
- The FR/EN button sits beside the day/night button and reloads the page in the
  other language.
- `js/layout.js` builds the shared header (logo, title, navigation, FR/EN
  button) from one place. A page only holds
  `<div class="app-brand" data-page="..."></div>` followed by the script.
- Page texts are marked with `data-i18n="key"` (text), `data-i18n-html="key"`
  (HTML) or `data-i18n-attr="title:key; aria-label:key2"` (attributes). The keys
  are nested in the JSON files, for example `options.title`.
- Help pages are translated paragraph by paragraph:
  `locales/help/<page>.fr.json` maps each English heading, paragraph or list item
  of the page to its French text, and `"@title"` to the browser tab title. The
  screenshots are shared by both languages. A paragraph changed in English stays
  in English until its translation is updated: open the page with
  `?lang=fr&i18n=debug` to outline the untranslated blocks and list them in the
  console.
- The release notes stay in English.
- Speeds are shown in `kt` in English and `nds` in French. Decimals keep the dot
  in both languages, as in the TWS field.

To change a text, edit `locales/en.json` and `locales/fr.json`, then run
`node tools/check-i18n.js`: it lists the keys missing in a language and the keys
used by the pages or scripts that are not defined. To add a language, add its
code to `LANGUAGES` in `js/i18n.js`, then a `locales/<code>.json` file with the
same keys as `locales/en.json`.
