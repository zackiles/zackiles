/**
 * Terminal animator - Creates SVG animations of terminal sessions
 * Config format example:
 * {
 *   "width": 800, "height": 200, "fontFamily": "Courier New", "fontSize": 18,
 *   "colors": { "bg": "black", "terminalLines": "#00FF00", "user": "#00ffff",
 *               "host": "#ffaa00", "symbol": "#fff", "command": "#fff" },
 *   "charWidth": 11,
 *   "steps": [{
 *     "terminalLines": ["file1.txt", "file2.txt"],
 *     "shellPrompt": { "user": "user", "host": "machine", "symbol": ":~$" },
 *     "command": "ls",
 *     "timing": { "start": 1, "perChar": 0.2, "hold": 1 }
 *   }]
 * }
 */
import { chromium } from 'playwright'
import { extname, join } from '@std/path'
import { dedent } from '@qnighy/dedent'
import { stringify } from '@libs/xml'
import { parseArgs } from '@std/cli/parse-args'
import type { Config, ShellPrompt, TerminalStep } from './types.ts'

const environment = Deno.env.get('DENO_ENV') || 'production'
const frame1 = join(Deno.cwd(), 'temp', 'frame1.png')
const frame2 = join(Deno.cwd(), 'temp', 'frame2.png')

// Helper function to load configuration from either JSON or TypeScript file
async function loadConfig(configPath: string): Promise<Config> {
  const ext = extname(configPath).toLowerCase()

  if (ext === '.ts') {
    // For TypeScript files, import the module and use its default export
    // Create a proper file URL for the import by resolving against the current directory
    const fileUrl = new URL(`file://${Deno.cwd()}/${configPath}`).href
    const module = await import(fileUrl)
    return module.default
  }

  if (ext === '.json') {
    // For JSON files, read and parse the file
    const content = await Deno.readTextFile(configPath)
    return JSON.parse(content)
  }

  throw new Error(`Unsupported config file type: ${ext}. Only .json and .ts files are supported.`)
}

const takeScreenshot = async (html: string, config: Config) => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html)

  // Calculate the total animation duration for all steps
  let totalDuration = 0

  config.steps.forEach((step, _index) => {
    // Calculate timing for this step
    const stepStart = step.timing.start * 1000 // convert to ms
    const stepDuration = (step.command.length * step.timing.perChar + step.timing.hold) * 1000 // convert to ms
    const stepEnd = stepStart + stepDuration

    // Keep track of the latest ending time
    totalDuration = Math.max(totalDuration, stepEnd)
  })

  // Take first screenshot at the start of the first step
  const firstStepStart = config.steps[0].timing.start * 1000
  await page.waitForTimeout(firstStepStart)
  await page.screenshot({ path: frame1 })

  // Take second screenshot 1 second before the animation ends
  const secondScreenshotTime = Math.max(0, totalDuration - 1000) - firstStepStart
  await page.waitForTimeout(secondScreenshotTime)
  await page.screenshot({ path: frame2 })

  await browser.close()
}

function escapeXML(str: string): string {
  const escaped = stringify({ temp: { '#text': String(str) } }, {
    replace: { entities: true },
    format: { indent: '' },
  })
  return escaped.match(/<temp>(.*?)<\/temp>/s)?.[1] || String(str)
}

const buildSVG = (config: Config, basename = 'build'): { html: string; svg: string } => {
  let content = ''
  let currentTime = 0

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
        <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="${
      index === 0 ? '0s' : `${
        config.steps[index - 1].timing.start +
        config.steps[index - 1].command.length * config.steps[index - 1].timing.perChar +
        config.steps[index - 1].timing.hold + 0.5
      }s`
    }" fill="freeze" />
        ${
      !isLastStep
        ? `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.9;1" dur="0.2s" begin="${fadeOutAt}s" fill="freeze" />`
        : ''
    }
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
  ): string => {
    if (!command) return ''

    let tspans = ''
    let time = timing.start
    // Add small spacing factor to prevent overlap with prompt
    const charWidthFactor = 0.8
    const commandPadding = -5

    for (let i = 0; i < command.length; i++) {
      // Calculate position for each character with added padding
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

    return dedent`
      <g id="${id}" opacity="1">
        ${tspans}
        <animate attributeName="opacity" values="1;0" dur="0.2s" begin="${
      fadeOut.toFixed(2)
    }s" fill="freeze"/>
      </g>
    `
  }

  // Process each animation step
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
    const fadeOutAt = step.timing.start + (step.command.length * step.timing.perChar) +
      step.timing.hold

    content += renderLines(step.terminalLines, fadeOutAt, index, isLastStep)

    // Only render prompt and command if not the last step
    if (!isLastStep) {
      content += renderPrompt(step.shellPrompt, promptX)
      content += renderCommand(step.command, step.timing, commandX, `command-${index}`)
    }

    currentTime = Math.max(currentTime, fadeOutAt + 0.5)
  })

  const svgContent = dedent`
    <svg width="100%" height="100%" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg" data-duration="${
    currentTime + 1
  }s">
      <rect width="${config.width}" height="${config.height}" fill="${config.colors.bg}" />
      ${content}
    </svg>`

  const fullSvg = dedent`<?xml version="1.0" encoding="UTF-8"?>
    ${svgContent}`

  const htmlContent = dedent`<!DOCTYPE html>
    <html style="width: 100%; height: 100%;">
      <body width="100%" height="100%">
        <img src="${basename}.svg" width="100%" alt="Terminal Animation">
      </body>
    </html>`

  return { html: htmlContent, svg: fullSvg }
}

async function main() {
  let config: Config | undefined
  let htmlPath = ''
  let svgPath = ''

  try {
    const args = parseArgs(Deno.args, {
      string: ['config', 'output'],
      alias: { c: 'config', o: 'output' },
      default: { output: 'build.html' },
    })

    if (!args.config) {
      throw new Error('Required option --config is missing')
    }

    // Load config from either JSON or TypeScript file
    config = await loadConfig(args.config)

    if (!config?.steps?.length) throw new Error('Invalid configuration: missing steps array')

    // Parse the output path to get the base name without extension
    const outputPath = args.output
    const outputExt = extname(outputPath)
    const outputBaseName = outputPath.slice(0, outputPath.length - outputExt.length)

    // Create output paths with appropriate extensions
    htmlPath = `${outputBaseName}.html`
    svgPath = `${outputBaseName}.svg`

    // Get just the filename without the path
    const basename = outputBaseName.split('/').pop() || 'build'

    const { html, svg } = buildSVG(config, basename)

    // Write both files
    await Deno.writeTextFile(htmlPath, html)
    await Deno.writeTextFile(svgPath, svg)

    console.log(`HTML saved to ${htmlPath}`)
    console.log(`SVG saved to ${svgPath}`)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
  } finally {
    if (environment === 'test' || environment === 'development') {
      if (config && htmlPath) {
        await takeScreenshot(await Deno.readTextFile(htmlPath), config).then(() => {
          console.log('Screenshots taken', {
            frame1,
            frame2,
          })
        }).catch(console.error)
      }
    }
    if (environment === 'development') {
      // Keep the process running indefinitely in development mode
      await new Promise<void>(() => console.log(`Running in ${environment} mode`)).catch(() => {})
    }
  }
}

if (import.meta.main) {
  main()
}
