/**
 * Types for terminal animator
 */

type ShellPrompt = {
  user: string
  host: string
  symbol: string
  path?: string
}

type TerminalStep = {
  terminalLines: string[]
  shellPrompt: ShellPrompt
  command: string
  timing: {
    start: number
    perChar: number
    hold: number
    fadeIn?: number
  }
  position?: {
    promptX?: number
    commandX?: number
  }
}

type OutputType = 'html' | 'svg' | 'gif'

type Config = {
  width: number
  height: number
  fontFamily: string
  fontSize: number
  loop: boolean
  name?: string
  outputDirectory?: string
  outputTypes?: OutputType[]
  embed?: boolean
  colors: {
    bg: string
    terminalLines: string
    user: string
    host: string
    path?: string
    symbol: string
    command: string
  }
  charWidth: number
  steps: TerminalStep[]
}

export type { Config, OutputType, ShellPrompt, TerminalStep }
