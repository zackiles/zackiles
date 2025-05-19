import { type Browser, chromium } from 'playwright'
import { extname, join } from '@std/path'
import { dedent } from '@qnighy/dedent'
import { stringify } from '@libs/xml'
import { parseArgs } from '@std/cli/parse-args'
import { ensureDir } from '@std/fs/ensure-dir'
import { parse as parseJSON } from '@std/jsonc'
import type { Config, ShellPrompt, TerminalStep } from './types.ts'
import { applyDefaults } from './defaults.ts'

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
    const stepEndTime = stepStart + stepDuration

    totalDuration = Math.max(totalDuration, stepEndTime)

    if (index < config.steps.length - 1) {
      totalDuration += 0.5
    }
  })

  return totalDuration + (config.loop ? 5 : 1)
}

async function takeScreenshot(html: string, config: Config) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html)

  const totalDuration = computeTotalAnimationTime(config)
  const firstStepStart = config.steps[0].timing.start * 1000

  await page.waitForTimeout(firstStepStart)
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
  const currentTime = computeTotalAnimationTime(config)
  const shouldLoop = forceLoop || config.loop
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

    const animateStart = index === 0 ? '0s' : `${
      config.steps[index - 1].timing.start +
      config.steps[index - 1].command.length * config.steps[index - 1].timing.perChar +
      config.steps[index - 1].timing.hold + 0.5
    }s`

    const fadeOutAnimation = !isLastStep
      ? `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.9;1" dur="0.2s" begin="${fadeOutAt}s" fill="freeze" />`
      : shouldLoop
      ? `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.9;1" dur="0.2s" begin="${fadeOutAt}s" fill="freeze" repeatCount="indefinite" />`
      : ''

    return dedent`
      <g id="terminal-window-lines-${index}" opacity="0">
        ${
      lines.map((line, i) =>
        `<text x="20" y="${
          40 + i * 20
        }" style="font-family: ${config.fontFamily}; font-size: ${config.fontSize}px; fill: ${config.colors.terminalLines};">${
          escapeXML(line)
        }</text>`
      ).join('\n        ')
    }
        <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="${animateStart}" fill="freeze" />
        ${fadeOutAnimation}
      </g>
    `
  }

  const renderPrompt = (prompt: ShellPrompt, x = 20): string => {
    const pathTspan = prompt.path
      ? `<tspan style="fill: ${config.colors.path || config.colors.host};">:${
        escapeXML(prompt.path)
      }</tspan>`
      : ''

    return dedent`
      <text x="${x}" y="${
      config.height - 5
    }" style="font-family: ${config.fontFamily}; font-size: ${config.fontSize}px;">
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

    let tspans = ''
    let time = timing.start
    const charWidthFactor = 0.8
    const commandPadding = -5

    for (let i = 0; i < command.length; i++) {
      const charX = xStart + commandPadding + (i * (config.charWidth * charWidthFactor))
      tspans += `<text x="${charX}" y="${
        config.height - 5
      }" opacity="0" style="font-family: ${config.fontFamily}; font-size: ${config.fontSize}px; fill: ${config.colors.command};">${
        escapeXML(command[i])
      }<animate attributeName="opacity" from="0" to="1" begin="${
        time.toFixed(2)
      }s" dur="0.01s" fill="freeze"/></text>`
      time += timing.perChar
    }

    const fadeOut = Math.max(
      timing.start + (command.length || 1) * timing.perChar + timing.hold,
      timing.start + 0.1,
    )

    const extendedFadeOut = isLastStep && shouldLoop ? fadeOut + 5 : fadeOut
    const loopAttr = isLastStep && shouldLoop ? ' repeatCount="indefinite"' : ''

    return dedent`
      <g id="${id}" opacity="1">
        ${tspans}
        <animate attributeName="opacity" values="1;0" dur="0.2s" begin="${
      extendedFadeOut.toFixed(2)
    }s" fill="freeze"${loopAttr}/>
      </g>
    `
  }

  config.steps.forEach((step, index) => {
    const isLastStep = index === config.steps.length - 1

    if (index > 0) {
      const prevStep = config.steps[index - 1]
      const prevEndTime = prevStep.timing.start +
        (prevStep.command.length * prevStep.timing.perChar) + prevStep.timing.hold + 0.5
      if (step.timing.start < prevEndTime) step.timing.start = prevEndTime
    }

    const promptX = step.position?.promptX ?? 20
    const promptWidth = calcPromptWidth(step.shellPrompt)
    const commandX = step.position?.commandX ?? (promptX + promptWidth + 5)

    const fadeOutAt = isLastStep && config.loop
      ? step.timing.start + (step.command.length * step.timing.perChar) + step.timing.hold + 5
      : step.timing.start + (step.command.length * step.timing.perChar) + step.timing.hold

    content += renderLines(step.terminalLines, fadeOutAt, index, isLastStep)

    if (!isLastStep) {
      content += renderPrompt(step.shellPrompt, promptX)
      content += renderCommand(step.command, step.timing, commandX, `command-${index}`)
    } else if (config.loop) {
      content += renderCommand(step.command, step.timing, commandX, `command-${index}`, true)
    }
  })

  const svgContent = dedent`
    <svg width="100%" height="100%" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg" data-duration="${currentTime}s">
      <rect width="${config.width}" height="${config.height}" fill="${config.colors.bg}" />
      ${content}
    </svg>`

  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${svgContent}`

  const html = config.embed
    ? dedent`<!DOCTYPE html>
      <html style="width: 100%; height: 100%;">
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
  const fps = 30
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
    await Deno.remove(palettePath)
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
        if (!configPath) throw new Error('No config path provided for test/dev mode')

        const config = await loadConfig(configPath)
        const htmlPath = join(Deno.cwd(), config.name || 'animation') + '.html'

        await takeScreenshot(await Deno.readTextFile(htmlPath), config)
        console.log('Screenshots taken', { animationStartFrame, animationEndFrame })
      } catch (error) {
        console.error(error)
      }
    }

    if (environment === 'development') {
      await new Promise<void>(() => console.log(`Running in ${environment} mode`)).catch(() => {})
    }
  }
}

if (import.meta.main) {
  main()
}

export {
  buildSVG,
  computeTotalAnimationTime,
  escapeXML,
  loadConfig,
  main,
  renderGif,
  takeScreenshot,
}
