# LSV TOXCct 6.1.4 — responsive redesign and interactive chart

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
- Help navigation and chart screenshots aligned with the modern interface.

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

- Above 1080 px: race information, chart and controls use three columns.
- From 761 to 1080 px: the chart is centered above two control columns.
- Up to 760 px: the interface becomes a single column and race thumbnails are
  replaced by the native race selector.
- Up to 420 px: navigation and TWA controls are further condensed.

## Main files

- `css/modern.css`: shared design system and responsive rules.
- `js/modern_ui.js`: fullscreen chart behavior.
- `js/polars_echarts.js`: interactive ECharts renderer.
- `js/polars_chart.js`: historical canvas fallback.
- `js/lib/echarts-6.1.0.min.js`: locally bundled Apache ECharts runtime.
- `js/lib/ECHARTS-LICENSE.txt`: Apache ECharts license.
- `index.htm`: new application shell and updated controls.

## Deployment

Deploy the contents of the `polars` directory as before. Keep the directory
structure intact because pages use relative links to CSS, JavaScript and image
assets.
