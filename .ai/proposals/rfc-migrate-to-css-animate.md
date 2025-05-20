# Refactor to Pure CSS Animations Instead of SMIL

## Objectives

* Replace every `<animate>` / `<set>` / `<animateTransform>` element with CSS keyframes.
* Preserve timing, per-character typing, fade sequences, and infinite looping.
* Keep existing config file interface unchanged.
* Embed all style in either `<style>` inside the SVG (when `embed:true`) or `<style>` tag in generated HTML.

## 1. Update Timing Model

* Keep `computeTotalAnimationTime` logic.
* For each step compute absolute `start`, `end`, `hold`, `transition`.
* Derive a **global cycle duration** `cycleMs = totalDuration * 1000`.

## 2. Build CSS Generation Helpers

* `buildKeyframes(name, keyframes: { pct:number, props:string }[]) -> string`
* `buildRule(selector, decls:string) -> string`
* Create arrays `cssKeyframes[]`, `cssRules[]`. Append as SVG/HTML `<style>` content.

### Example

```css
@keyframes fade-0 {
  0%   { opacity:0 }
  10%  { opacity:1 }
  90%  { opacity:1 }
  100% { opacity:0 }
}
.line-0 { animation: fade-0 11s linear infinite; animation-delay:0s; animation-fill-mode:forwards }
```

## 3. Refactor `renderLines`

* Wrap group `<g>` with class `.line-${index}`; remove SMIL tags.
* Push a keyframe spec to fade in/out using `fade-${index}`.
* Compute `animation-delay = step.timing.start`.

## 4. Refactor `renderPrompt`

* Assign class `.prompt-${index}`; add rule for static `opacity:1`.
* No animation unless it disappears; if so generate `fade-prompt-${index}` similar to lines.

## 5. Refactor `renderCommand`

* For each char create `<text class="cmd-${step}-${i}">`.
* Push rule `animation:type-${step}-${i} 0.01s steps(1,end) forwards` with `animation-delay = charStart`.
* Build one-liner keyframe `type-${step}-${i}`: `0%{opacity:0}100%{opacity:1}`.
* Group fade-out handled with `.cmd-group-${step}` rule + keyframes.

## 6. Infinite Loop Implementation

* Apply `animation-iteration-count: infinite` to every fading/typing keyframe.
* Ensure `animation-delay` wraps by letting total cycle equal keyframe duration.
* For commands that should reset between cycles set `animation-fill-mode: forwards`.

## 7. Modify `buildSVG` Output

* Remove all `loopAnimationTrigger` SMIL.
* Collect `cssKeyframes.join('\n')` and `cssRules.join('\n')`.
* Inject:

```html
<style>
  svg * { vector-effect:inherit }
  /* <<keyframes>> */
  /* <<rules>> */
</style>
```

* Keep `<rect>` and text groups unchanged except new class names.

## 8. Adjust GIF Path

* No change; Playwright renders CSS natively.

## 9. Delete SMIL-Specific IDs & xlink Logic

* Remove attributes `id="first-fade" restart="always"` etc.
* Eliminate `<set>` restarts.

## 10. Validate

1. `deno run main.ts --config example.json` → SVG plays loop smoothly in Chrome.
2. `ffmpeg` GIF matches old timing.

## 11. Optional Enhancements

* CLI flag `--external-css` to emit separate `.css` file referenced via `<link>` in HTML.
* Feature toggle `config.useCss` to switch generation path.
