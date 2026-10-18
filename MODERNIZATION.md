# LSV TOXCct 6.1.7 — responsive redesign and interactive chart

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
- High zoom levels clip active-sail points outside the visible polar ranges, preventing folded curve segments.
- The focused Boat Speed scale adapts progressively to the active speed and local sail-curve variation.
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
