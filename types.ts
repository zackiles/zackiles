/**
 * Types for terminal animator
 */

export type ShellPrompt = {
  user: string
  host: string
  symbol: string
  path?: string
}

export type TerminalStep = {
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

export type Config = {
  width: number
  height: number
  fontFamily: string
  fontSize: number
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
