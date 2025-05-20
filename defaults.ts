import type { Config, OutputType, TerminalStep } from './types.ts'

// Default config to be used across the application
export const defaultConfig = {
  width: 800,
  height: 200,
  fontFamily: 'Courier New',
  fontSize: 18,
  loop: false,
  name: 'animation',
  outputTypes: ['html', 'svg', 'gif'] as OutputType[],
  embed: false,
  useCss: true,
  colors: {
    bg: 'black',
    terminalLines: '#00FF00',
    user: '#00ffff',
    host: '#ffaa00',
    symbol: '#fff',
    command: '#fff',
  },
  charWidth: 11,
}

// Default step values
export const defaultStep = {
  terminalLines: [],
  command: '',
  shellPrompt: {
    user: 'user',
    host: 'host',
    symbol: ':~$',
  },
  timing: {
    start: 0,
    perChar: 0.2,
    hold: 5,
    fadeIn: 0.2,
  },
}

function applyDefaults(configData: Record<string, unknown>): Config {
  return {
    // Global configuration defaults
    width: (configData.width as number) ?? defaultConfig.width,
    height: (configData.height as number) ?? defaultConfig.height,
    fontFamily: (configData.fontFamily as string) ?? defaultConfig.fontFamily,
    fontSize: (configData.fontSize as number) ?? defaultConfig.fontSize,
    loop: (configData.loop as boolean) ?? defaultConfig.loop,
    name: (configData.name as string) ?? defaultConfig.name,
    outputDirectory: configData.outputDirectory as string | undefined,
    outputTypes: (configData.outputTypes as OutputType[]) ?? defaultConfig.outputTypes,
    embed: (configData.embed as boolean) ?? defaultConfig.embed,
    useCss: (configData.useCss as boolean) ?? defaultConfig.useCss,

    // Color defaults
    colors: {
      bg: (configData.colors as Record<string, unknown>)?.bg as string ?? defaultConfig.colors.bg,
      terminalLines: (configData.colors as Record<string, unknown>)?.terminalLines as string ??
        defaultConfig.colors.terminalLines,
      user: (configData.colors as Record<string, unknown>)?.user as string ??
        defaultConfig.colors.user,
      host: (configData.colors as Record<string, unknown>)?.host as string ??
        defaultConfig.colors.host,
      symbol: (configData.colors as Record<string, unknown>)?.symbol as string ??
        defaultConfig.colors.symbol,
      command: (configData.colors as Record<string, unknown>)?.command as string ??
        defaultConfig.colors.command,
      path: (configData.colors as Record<string, unknown>)?.path as string | undefined,
    },

    // Character width default
    charWidth: (configData.charWidth as number) ?? defaultConfig.charWidth,

    // Steps defaults
    steps: (configData.steps as TerminalStep[]).map((step) => ({
      // Default empty array for terminal lines if not provided
      terminalLines: step.terminalLines ?? defaultStep.terminalLines,

      // Default shell prompt
      shellPrompt: step.shellPrompt ?? defaultStep.shellPrompt,

      // Default empty string for command
      command: step.command ?? defaultStep.command,

      // Default timing values
      timing: {
        start: step.timing?.start ?? defaultStep.timing.start,
        perChar: step.timing?.perChar ?? defaultStep.timing.perChar,
        hold: step.timing?.hold ?? defaultStep.timing.hold,
        fadeIn: step.timing?.fadeIn ?? defaultStep.timing.fadeIn,
      },

      // Optional position can remain as is
      position: step.position,
    })),
  }
}

export { applyDefaults }
