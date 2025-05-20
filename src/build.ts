import { type Browser, chromium } from 'playwright'
import { extname, join } from '@std/path'
import { dedent } from '@qnighy/dedent'
import { stringify } from '@libs/xml'
import { parseArgs } from '@std/cli/parse-args'
import { ensureDir } from '@std/fs/ensure-dir'
import { parse as parseJSON } from '@std/jsonc'
import type { Config, ShellPrompt, TerminalStep } from './types.ts'
import { applyDefaults } from './defaults.ts'
import TIMINGS from './timings.ts'

// CSS animation helpers for the new implementation
type Keyframe = { pct: number; props: string }
type CSSRule = { selector: string; declarations: string }

function buildKeyframes(name: string, keyframes: Keyframe[]): string {
  const keyframeEntries = keyframes
    .map((kf) => `  ${kf.pct}% { ${kf.props} }`)
    .join('\n')

  return `@keyframes ${name} {\n${keyframeEntries}\n}`
}

function buildRule(selector: string, declarations: string): string {
  return `${selector} { ${declarations} }`
}

const environment = Deno.env.get('DENO_ENV') || 'production'
const animationStartFrame = join(Deno.cwd(), 'temp', 'frame1.png')
const animationEndFrame = join(Deno.cwd(), 'temp', 'frame2.png')

async function loadConfig(configPath: string): Promise<Config> {
  const ext = extname(configPath).toLowerCase()

  if (ext === '.ts' || ext === '.js') {
    const fileUrl = new URL(`file://${Deno.cwd()}/${configPath}`).href
    const module = await import(fileUrl)
    return applyDefaults(module.default)
  }

  if (ext === '.json' || ext === '.jsonc') {
    const content = await Deno.readTextFile(configPath)
    const parsedConfig = parseJSON(content)

    if (parsedConfig === null || typeof parsedConfig !== 'object') {
      throw new Error('Invalid configuration: config must be a non-null object')
    }

    const configData = parsedConfig as Record<string, unknown>

    if (!configData.steps || !Array.isArray(configData.steps)) {
      throw new Error('Invalid configuration: missing or invalid "steps" array')
    }

    return applyDefaults(configData)
  }

  throw new Error(
    `Unsupported config file type: ${ext}. Only .json, .jsonc, .js, and .ts files are supported.`,
  )
}

function computeTotalAnimationTime(config: Config): number {
  let totalDuration = 0

  config.steps.forEach((step, index) => {
    const stepStart = step.timing.start
    const commandTypingDuration = step.command.length * step.timing.perChar
    const stepDuration = commandTypingDuration + step.timing.hold

    // For the last step in loop mode, add LAST_STEP_EXTRA_TIME
    const isLastStep = index === config.steps.length - 1
    const extraPause = isLastStep && config.loop ? TIMINGS.LAST_STEP_EXTRA_TIME : 0
    const stepEndTime = stepStart + stepDuration + extraPause

    totalDuration = Math.max(totalDuration, stepEndTime)

    if (index < config.steps.length - 1) {
      totalDuration += TIMINGS.STEP_TRANSITION
    }
  })

  return totalDuration + (config.loop ? TIMINGS.LOOP_EXTRA_TIME : TIMINGS.NON_LOOP_EXTRA_TIME)
}

async function takeScreenshot(html: string, config: Config) {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium-headless-shell'
  })
  const page = await browser.newPage()
  await page.setContent(html)

  const totalDuration = computeTotalAnimationTime(config)
  const firstStepStart = config.steps[0].timing.start * 1000

  await page.waitForTimeout(TIMINGS.SCREENSHOT_INITIAL_DELAY)
  await page.screenshot({ path: animationStartFrame })

  const secondScreenshotTime = Math.max(0, totalDuration * 1000 - 1000) - firstStepStart
  await page.waitForTimeout(secondScreenshotTime)
  await page.screenshot({ path: animationEndFrame })

  await browser.close()
}

function escapeXML(str: string): string {
  const escaped = stringify({ temp: { '#text': String(str) } }, {
    replace: { entities: true },
    format: { indent: '' },
  })
  return escaped.match(/<temp>(.*?)<\/temp>/s)?.[1] || String(str)
}

function buildSVG(
  config: Config,
  basename = 'build',
  forceLoop = false,
): { html: string; svg: string } {
  // CSS animations are always embedded in the SVG for consistent behavior
  // The embed flag only controls whether the SVG content is embedded in HTML or linked as a file
  const totalDuration = computeTotalAnimationTime(config)
  const shouldLoop = forceLoop || config.loop

  // CSS collections for the CSS implementation
  const cssKeyframes: string[] = []
  const cssRules: string[] = []

  // Calculate global cycle duration in ms for CSS animations
  const cycleMs = totalDuration * 1000
  let content = ''

  const calcPromptWidth = (prompt: ShellPrompt): number =>
    `${prompt.user}@${prompt.host}${prompt.path ? `:${prompt.path}` : ''}${prompt.symbol}`.length *
    config.charWidth

  const renderLines = (
    lines: string[],
    fadeOutAt: number,
    index: number,
    isLastStep: boolean,
  ): string => {
    if (!lines.length) return ''

    // Calculate animation start time from previous step's timing
    const animateStart = index === 0 ? 0 : (
      config.steps[index - 1].timing.start +
      config.steps[index - 1].command.length * config.steps[index - 1].timing.perChar +
      config.steps[index - 1].timing.hold + TIMINGS.STEP_TRANSITION
    )

    // Create a CSS class name for this line group
    const className = `line-${index}`

    // Calculate exact timing percentages for the animation keyframes
    // fadeOutAt is pre-calculated in the main loop and includes LAST_STEP_EXTRA_TIME for last step when looping
    const fadeInStart = Number.parseFloat(((animateStart / totalDuration) * 100).toFixed(4))
    const fadeInEnd = Number.parseFloat((fadeInStart + (0.2 / totalDuration) * 100).toFixed(4))
    const fadeOutStart = Number.parseFloat(((fadeOutAt / totalDuration) * 100).toFixed(4))
    const fadeOutEnd = Number.parseFloat((fadeOutStart + (0.2 / totalDuration) * 100).toFixed(4))

    // Generate keyframes for fading in and out
    const keyframeName = `fade-${index}`

    // For the last step, we can apply a special animation timing if needed
    // This directly uses the isLastStep parameter to satisfy the linter
    const animationStyle = isLastStep && config.loop
      ? `${keyframeName} ${cycleMs}ms linear infinite`
      : `${keyframeName} ${cycleMs}ms linear ${shouldLoop ? 'infinite' : '1'}`

    cssKeyframes.push(buildKeyframes(keyframeName, [
      { pct: 0, props: 'opacity: 0;' },
      { pct: fadeInStart, props: 'opacity: 0;' },
      { pct: fadeInEnd, props: 'opacity: 1;' },
      { pct: fadeOutStart, props: 'opacity: 1;' },
      { pct: fadeOutEnd, props: 'opacity: 0;' },
      { pct: 100, props: 'opacity: 0;' },
    ]))

    // Add CSS rule for the animation
    const rule: CSSRule = {
      selector: `.${className}`,
      declarations: `animation: ${animationStyle};`,
    }
    cssRules.push(buildRule(rule.selector, rule.declarations))

    return dedent`
      <g class="${className}">
        ${
      lines.map((line, i) =>
        `<text x="20" y="${
          40 + i * 20
        }" style="font-family: ${config.fontFamily}; font-size: ${config.fontSize}px; fill: ${config.colors.terminalLines};">${
          escapeXML(line)
        }</text>`
      ).join('\n        ')
    }
      </g>
    `
  }

  const renderPrompt = (prompt: ShellPrompt, x = 20, stepIndex = 0): string => {
    const pathTspan = prompt.path
      ? `<tspan style="fill: ${config.colors.path || config.colors.host};">:${
        escapeXML(prompt.path)
      }</tspan>`
      : ''

    // Create a CSS class name for this prompt
    const className = `prompt-${stepIndex}`

    // We only need a rule for the prompt visibility
    const rule: CSSRule = {
      selector: `.${className}`,
      declarations: 'opacity: 1;',
    }
    cssRules.push(buildRule(rule.selector, rule.declarations))

    return dedent`
      <text x="${x}" y="${
      config.height - 5
    }" class="${className}" style="font-family: ${config.fontFamily}; font-size: ${config.fontSize}px;">
        <tspan style="fill: ${config.colors.user};">${
      escapeXML(prompt.user)
    }</tspan><tspan style="fill: ${config.colors.symbol};">@</tspan><tspan style="fill: ${config.colors.host};">${
      escapeXML(prompt.host)
    }</tspan>${pathTspan}<tspan style="fill: ${config.colors.symbol};">${
      escapeXML(prompt.symbol)
    }</tspan>
      </text>
    `
  }

  const renderCommand = (
    command: string,
    timing: TerminalStep['timing'],
    xStart: number,
    id: string,
    isLastStep = false,
  ): string => {
    if (!command) return ''

    let elements = ''
    const charWidthFactor = 0.8
    const commandPadding = -5
    const stepIndex = Number.parseInt(id.replace('command-', ''), 10)
    const groupClassName = `cmd-group-${stepIndex}`

    // Calculate fade-out timing percentages with adjustment for last step in loop mode
    const fadeOutStartTime = timing.start + command.length * timing.perChar + timing.hold +
      (isLastStep && config.loop ? TIMINGS.LAST_STEP_EXTRA_TIME : 0)
    const fadeOutStartPct = Number.parseFloat(((fadeOutStartTime / totalDuration) * 100).toFixed(4))
    const fadeOutEndPct = Number.parseFloat(
      (fadeOutStartPct + (0.2 / totalDuration) * 100).toFixed(4),
    )

    // Create keyframes for group fade-out
    const fadeOutKeyframeName = `fade-cmd-${stepIndex}`
    cssKeyframes.push(buildKeyframes(fadeOutKeyframeName, [
      { pct: 0, props: 'opacity: 1;' },
      { pct: fadeOutStartPct, props: 'opacity: 1;' },
      { pct: fadeOutEndPct, props: 'opacity: 0;' },
      { pct: 100, props: 'opacity: 0;' },
    ]))

    // Add rule for the command group
    const groupRule: CSSRule = {
      selector: `.${groupClassName}`,
      declarations: `animation: ${fadeOutKeyframeName} ${cycleMs}ms linear ${
        shouldLoop ? 'infinite' : '1'
      };`,
    }
    cssRules.push(buildRule(groupRule.selector, groupRule.declarations))

    for (let i = 0; i < command.length; i++) {
      const charX = xStart + commandPadding + (i * (config.charWidth * charWidthFactor))
      const charClassName = `cmd-${stepIndex}-${i}`
      const charStartTime = timing.start + (i * timing.perChar)
      const charStartPct = Number.parseFloat(((charStartTime / totalDuration) * 100).toFixed(4))

      // Create keyframes for character typing
      const typeKeyframeName = `type-${stepIndex}-${i}`
      cssKeyframes.push(buildKeyframes(typeKeyframeName, [
        { pct: 0, props: 'opacity: 0;' },
        { pct: Number.parseFloat((charStartPct - 0.01).toFixed(4)), props: 'opacity: 0;' },
        { pct: charStartPct, props: 'opacity: 1;' },
        { pct: 100, props: 'opacity: 1;' },
      ]))

      // Add rule for the character
      const charRule: CSSRule = {
        selector: `.${charClassName}`,
        declarations: `animation: ${typeKeyframeName} ${cycleMs}ms steps(1, end) ${
          shouldLoop ? 'infinite' : '1'
        } forwards;`,
      }
      cssRules.push(buildRule(charRule.selector, charRule.declarations))

      elements += `<text x="${charX}" y="${
        config.height - 5
      }" class="${charClassName}" style="font-family: ${config.fontFamily}; font-size: ${config.fontSize}px; fill: ${config.colors.command};">${
        escapeXML(command[i])
      }</text>`
    }

    return dedent`
      <g class="${groupClassName}">
        ${elements}
      </g>
    `
  }

  config.steps.forEach((step, index) => {
    // Determine if this is the last animation step for special timing handling
    const isLastStep = index === config.steps.length - 1

    // Ensure steps don't overlap by adjusting start times based on previous step
    if (index > 0) {
      const prevStep = config.steps[index - 1]
      const prevEndTime = prevStep.timing.start +
        (prevStep.command.length * prevStep.timing.perChar) + prevStep.timing.hold +
        TIMINGS.STEP_TRANSITION
      if (step.timing.start < prevEndTime) step.timing.start = prevEndTime
    }

    const promptX = step.position?.promptX ?? 20
    const promptWidth = calcPromptWidth(step.shellPrompt)
    const commandX = step.position?.commandX ?? (promptX + promptWidth + 5)

    // Calculate when terminal lines and commands should fade out
    // For the last step in loop mode, add extra pause time before fadeout to create a natural loop transition
    const fadeOutAt = isLastStep && config.loop
      ? step.timing.start + (step.command.length * step.timing.perChar) + step.timing.hold +
        TIMINGS.LAST_STEP_EXTRA_TIME
      : step.timing.start + (step.command.length * step.timing.perChar) + step.timing.hold

    // Render terminal output lines with appropriate timing
    content += renderLines(step.terminalLines, fadeOutAt, index, isLastStep)

    // Handle commands and prompts differently for last step when looping
    if (!isLastStep) {
      content += renderPrompt(step.shellPrompt, promptX, index)
      content += renderCommand(step.command, step.timing, commandX, `command-${index}`)
    } else if (config.loop) {
      content += renderPrompt(step.shellPrompt, promptX, index)
      // Pass isLastStep=true to renderCommand for last step to handle special timing
      content += renderCommand(step.command, step.timing, commandX, `command-${index}`, true)
    }
  })

  // Add SVG attributes
  const svgAttributes =
    `width="100%" height="100%" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg" data-duration="${totalDuration}s" preserveAspectRatio="xMidYMid meet"`

  // Combine all CSS
  const cssContent = `
    /* Vector effect inheritance */
    svg * { vector-effect: inherit; }

    /* Keyframes */
    ${cssKeyframes.join('\n')}

    /* Rules */
    ${cssRules.join('\n')}
  `

  const svgContent = dedent`
    <svg ${svgAttributes}>
      <style>
      ${cssContent}
      </style>
      <rect width="${config.width}" height="${config.height}" fill="${config.colors.bg}" />
      ${content}
    </svg>`

  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${svgContent}`

  const html = config.embed
    ? dedent`<!DOCTYPE html>
      <html style="width: 100%; height: 100%;">
        <head>
          <style>
            body { margin: 0; padding: 0; overflow: hidden; background: #000; }
            svg { display: block; max-width: 100%; height: auto; }
            ${cssContent}
          </style>
        </head>
        <body width="100%" height="100%">
          ${svgContent}
        </body>
      </html>`
    : dedent`<!DOCTYPE html>
      <html style="width: 100%; height: 100%;">
        <body width="100%" height="100%">
          <img src="${basename}.svg" width="100%" alt="Terminal Animation">
        </body>
      </html>`

  return { html, svg: fullSvg }
}

async function renderGif(outputBase: string, htmlPath: string, config: Config) {
  const fps = TIMINGS.GIF_FPS
  const totalTime = computeTotalAnimationTime(config)
  const frameCount = Math.floor(totalTime * fps)
  const framesDir = join(Deno.cwd(), 'temp', 'frames')
  const tempDir = join(Deno.cwd(), 'temp')
  await ensureDir(framesDir)

  let tempHtmlPath = htmlPath
  let tempSvgPath = ''
  let browser: Browser | undefined

  try {
    const baseName = config.name || 'animation'
    const shouldCreateTemp = !config.loop || !config.embed

    if (shouldCreateTemp && config.outputTypes?.includes('gif')) {
      tempSvgPath = join(tempDir, `${baseName}-temp.svg`)
      tempHtmlPath = join(tempDir, `${baseName}-temp.html`)

      const { html, svg } = buildSVG(
        { ...config, loop: true, embed: true },
        `${baseName}-temp`,
        true,
      )

      await Deno.writeTextFile(tempSvgPath, svg)
      await Deno.writeTextFile(tempHtmlPath, html)

      console.log('Created temporary embedded SVG for GIF generation')
    }

    browser = await chromium.launch()
    const page = await browser.newPage({
      viewport: { width: config.width, height: config.height },
    })

    await page.setContent(await Deno.readTextFile(tempHtmlPath))
    await page.waitForTimeout(100)

    for (let i = 0; i < frameCount; i++) {
      const file = join(framesDir, `frame-${i.toString().padStart(3, '0')}.png`)
      await page.screenshot({ path: file })
      await page.waitForTimeout(1000 / fps)
    }
  } finally {
    if (browser) await browser.close()

    if (tempSvgPath) {
      try {
        await Deno.remove(tempSvgPath)
        await Deno.remove(tempHtmlPath)
        console.log('Temporary SVG files cleaned up')
      } catch (error) {
        console.warn('Error cleaning up temporary SVG files:', error)
      }
    }
  }

  const palettePath = join(tempDir, 'palette.png')

  await new Deno.Command('ffmpeg', {
    args: [
      '-y',
      '-framerate',
      `${fps}`,
      '-i',
      `${framesDir}/frame-%03d.png`,
      '-vf',
      'palettegen',
      palettePath,
    ],
  }).output()

  await new Deno.Command('ffmpeg', {
    args: [
      '-y',
      '-framerate',
      `${fps}`,
      '-i',
      `${framesDir}/frame-%03d.png`,
      '-i',
      palettePath,
      '-loop',
      '0',
      '-lavfi',
      'paletteuse',
      `${outputBase}.gif`,
    ],
  }).output()

  try {
    await Deno.remove(framesDir, { recursive: true })

    // Check if palette file exists before removal
    try {
      await Deno.stat(palettePath)
      await Deno.remove(palettePath)
    } catch {
      // File doesn't exist, silently ignore
    }
  } catch (error) {
    console.warn('Error during cleanup:', error)
  }

  return `${outputBase}.gif`
}

async function main() {
  try {
    const { config: configPath, 'output-directory': outputDirArg } = parseArgs(Deno.args, {
      string: ['config', 'output-directory'],
      alias: { c: 'config', o: 'output-directory' },
      default: {},
    })

    if (!configPath) throw new Error('Required option --config is missing')

    const config = await loadConfig(configPath)

    console.log('Config loaded:', {
      name: config.name,
      embed: config.embed,
      outputTypes: config.outputTypes,
      useCss: config.useCss,
    })

    if (!config?.steps?.length) throw new Error('Invalid configuration: missing steps array')

    const outputDirectory = outputDirArg || config.outputDirectory || Deno.cwd()
    await ensureDir(outputDirectory)

    const baseName = config.name || 'animation'
    const outputBasePath = join(outputDirectory, baseName)
    const htmlPath = `${outputBasePath}.html`
    const svgPath = `${outputBasePath}.svg`

    const shouldGenerateHtml = config.outputTypes?.includes('html') ?? true
    const shouldGenerateSvg = config.outputTypes?.includes('svg') ?? true
    const shouldGenerateGif = config.outputTypes?.includes('gif') ?? true
    const shouldEmbed = config.embed ?? false
    const forceGenerateSvg = shouldGenerateHtml && (!shouldEmbed || shouldEmbed)

    if (shouldGenerateSvg || shouldGenerateHtml || forceGenerateSvg) {
      const { html, svg } = buildSVG(config, baseName)

      if (shouldGenerateHtml) {
        await Deno.writeTextFile(htmlPath, html)
        console.log(`HTML saved to ${htmlPath}`)
      }

      if (shouldGenerateSvg || forceGenerateSvg) {
        await Deno.writeTextFile(svgPath, svg)
        console.log(`SVG saved to ${svgPath}`)
      }
    }

    if (shouldGenerateGif && environment === 'production') {
      if (!shouldGenerateHtml && !forceGenerateSvg) {
        const { html } = buildSVG({ ...config, embed: true }, baseName, true)
        await Deno.writeTextFile(htmlPath, html)
      }

      await renderGif(outputBasePath, htmlPath, config)
      console.log(`GIF saved to ${outputBasePath}.gif`)
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
  } finally {
    if (environment === 'test' || environment === 'development') {
      try {
        const configPath = Deno.args[1]
        if (configPath) {
          const config = await loadConfig(configPath)
          const htmlPath = `${join(Deno.cwd(), config.name || 'animation')}.html`

          await takeScreenshot(await Deno.readTextFile(htmlPath), config)
          console.log('Screenshots taken', { animationStartFrame, animationEndFrame })
        } else {
          console.error('No config path provided for test/dev mode')
        }
      } catch (error) {
        console.warn('Error in test/dev mode:', error)
      }
    }

    if (environment === 'development') {
      await new Promise<void>(() => console.log(`Running in ${environment} mode`)).catch(() => {})
    }
  }
}

// This is a script and not an importable module
if (import.meta.main) {
  main()
}
