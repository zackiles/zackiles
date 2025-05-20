# Setup Your Own Animation

Create your own terminal SVG or GIF.

## Quick Start

1. [Install Deno](https://docs.deno.com/runtime/getting_started/installation/) if you haven't already.
2. Install ffmpeg:

```sh
brew install ffmpeg
```

3. Clone this repository and run the following command:

```sh
deno task install:playwright
```

4. Edit either the TypeScript or JSON config and run:

```sh
deno run -A build.ts --config examples/config.ts
```

**That's it.** You should have the following files in the same path:

- `index.html`
- `index.svg`
- `index.gif`

Hack the planet.

## Configuring The Animation

Configure the animation using steps and global settings. You can configure every aspect of the animation in a TypeScript/JavaScript or JSON file.

After finishing your configuration file, build your animation by passing its path to the builder using `--config`.

> [!TIP]
> Full examples of both configuration types are in `examples/`. Explanations of each option are below.

### Step Configuration

Configure one or more steps. All steps share similar options:

- `terminalLines`: Shows in the terminal for that step (e.g., a list of directories).
- `shellPrompt`: Shows as the terminal prompt for that step (e.g., `user@machine`).
- `command`: Typed into the terminal for that step. Typically, this is the command that the **next** step shows the result of in the terminal lines.
- `timings`: A set of timings for that step (e.g., typing speed, holding time).

### Global Configuration

The animation uses these global configuration options:

#### Basic Settings

- `name`: The name (without extension) for the build files (i.e., `{name}.html`, `{name}.svg`, `{name}.gif`).
  - Default: 'animation'
- `outputDirectory`: Path to build the files. This is overridden if the `--output-directory` flag is provided to the builder.
  - Default: current working directory
- `outputTypes`: An array of strings for all build file types. Options are `html`, `svg`, `gif`.
  - Default: ['html', 'svg', 'gif']
- `embed`: When `html` is a build type, this chooses whether the SVG should be embedded in the HTML or built as a separate file and linked with an `img` tag. Setting `embed` to true forces an SVG to be built even if not included in `outputTypes`.
  - Default: false
- `useCss`: Determines the animation rendering method. When `true`, uses CSS animations for smooth, performant rendering. When `false`, falls back to alternative rendering techniques that may be less efficient or compatible. Recommended to keep as `true` for modern browsers and best performance.
  - Default: true
- `loop`: A boolean flag that determines whether the animation should repeat indefinitely. When `true`, the animation restarts after completing all steps.
  - Default: true

#### Display Settings

- `width`: The total width of the SVG animation in pixels. Determines the horizontal size of the terminal window.
  - Default: 800
- `height`: The total height of the SVG animation in pixels. Determines the vertical size of the terminal window.
  - Default: 200
- `fontFamily`: The font used for rendering text in the terminal. Defaults to monospace fonts like "Courier New" for a classic terminal look.
  - Default: 'Courier New, monospace'
- `charWidth`: The width of a single character in pixels. Used to calculate positioning for monospace layout.
  - Default: 11
- `fontSize`: The size of the text in pixels. Controls the readability and visual scale of the terminal text.
  - Default: 18

#### Color Settings

- `colors`: An object containing color values for different terminal elements:
  - `bg`: Terminal background color.
  - `terminalLines`: Color for terminal output lines.
  - `user`: Color for username in prompt.
  - `host`: Color for hostname in prompt.
  - `path`: Color for path in prompt (optional, falls back to host color if not specified).
  - `symbol`: Color for prompt symbol.
  - `command`: Color for typed commands.

#### Step Settings

- `terminalLines`: An array of strings representing the output lines displayed in the terminal for a specific step. These lines simulate command output or other terminal content.
  - Example: `["/PROJECTS", "deno-kit", "luna-ai", "cursor-config"]`
- `shellPrompt`: Configures the shell prompt display for the step:
  - `user`: Username displayed in the prompt (e.g., "your-name")
  - `host`: Hostname displayed in the prompt (e.g., "machine")
  - `symbol`: Prompt symbol (e.g., ":~$", "$", ">")
  - `path`: Optional working directory path to display in the prompt
- `command`: The command to be typed into the terminal for the step. This is typically the command that generates the output shown in `terminalLines`.
- `timing`: Controls the animation timing for the step:
  - `start`: Time in seconds from the beginning of the entire animation when this step begins. This is a cumulative time that takes into account the duration of previous steps and their transitions.
  - `perChar`: Time in seconds taken to type each character of the command
  - `hold`: Time in seconds to pause after the command finishes typing
  - `fadeIn`: Optional fade-in duration in seconds for smooth transitions between steps
- `position`: Optional positioning overrides for fine-tuning the layout:
  - `promptX`: X coordinate for the prompt start (default: 20)
  - `commandX`: X coordinate for the command start (default: promptX + promptWidth + 5)

> [!IMPORTANT]
> Timing Calculation Example:
>
> - Step 1 starts at 0s, takes 5 seconds to complete
> - Step 2 has `start: 6`, takes 8 seconds to complete
> - Total animation length will be approximately 14 seconds (6s + 8s)
>
> The `start` time ensures steps don't overlap:
>
> - If Step 1 actually takes longer than 5 seconds, the `start` of Step 2 will be automatically adjusted
> - Step transitions and loop timing are also factored into the total animation duration

> [!TIP]
> The step settings allow granular control over each moment in your terminal animation, from the displayed content to the precise timing of typing and transitions.

### Using JavaScript/TypeScript

Your file can export a default plain object (see Using JSON for an example of what that object would look like), or it can leverage the `Composer` class to fluently build a config:

```ts
import { Composer } from '../composer.ts'

// Create configuration using the Composer fluent API
const composer = new Composer({
  // Basic settings
  name: 'example',
  outputDirectory: '.',
  outputTypes: ['html', 'svg', 'gif'],
  embed: true,
  useCss: true,
  loop: true,

  // Display settings
  width: 800,
  height: 200,
  fontFamily: 'Courier New, monospace',
  charWidth: 11,
  fontSize: 18,

  // Color settings
  colors: {
    bg: 'black',
    terminalLines: '#00FF00',
    user: '#00ffff',
    host: '#ffaa00',
    path: '#ffaa00',
    symbol: '#ffffff',
    command: '#ffffff',
  },
})
  // First step in the animation
  .step
  .terminalLines([
    '/PROJECTS',
    'deno-kit',
    'luna-ai',
    'cursor-config',
  ])
  .shellPrompt({
    user: 'your-name',
    host: 'machine',
    symbol: ':~$',
  })
  .command('whois')
  .timing({
    start: 2,
    perChar: 0.2,
    hold: 2,
  })
  .done
  // Second step in the animation
  .step
  .terminalLines([
    '/SKILLS',
    'TypeScript',
    'Deno',
    'Animation',
  ])
  .shellPrompt({
    user: 'your-name',
    host: 'machine',
    symbol: ':~$',
  })
  .command('clear')
  .timing({
    start: 6,
    perChar: 0.2,
    hold: 3,
  })
  .done

// Export the configuration object
export default composer.toJSON()
```

The Composer API offers several advantages:

- Type checking and autocompletion in your IDE
- Chainable interface for building complex animations
- Reusable code patterns for similar steps
- Easy to programmatically generate steps

## Using JSON(c)

For a simpler approach, define your configuration directly in JSON or JSONC (JSON with comments):

```json
{
  "name": "example",
  "outputDirectory": ".",
  "outputTypes": ["html", "svg", "gif"],
  "embed": true,
  "useCss": true,
  "loop": true,

  "width": 800,
  "height": 200,
  "fontFamily": "Courier New, monospace",
  "charWidth": 11,
  "fontSize": 18,

  "colors": {
    "bg": "black",
    "terminalLines": "#00FF00",
    "user": "#00ffff",
    "host": "#ffaa00",
    "path": "#ffaa00",
    "symbol": "#ffffff",
    "command": "#ffffff"
  },
  "steps": [
    {
      "terminalLines": [
        "/PROJECTS",
        "project-1",
        "project-2",
        "project-3",
        "project-4"
      ],
      "shellPrompt": {
        "user": "your-name",
        "host": "machine",
        "symbol": ":~$"
      },
      "command": "whois",
      "timing": {
        "start": 2,
        "perChar": 0.2,
        "hold": 2
      }
    },
    {
      "terminalLines": [
        "/COUNTRY & CITY",
        "United States, San Francisco",
        "",
        "/LANGUAGES",
        "Typescript, Go, Rust"
      ],
      "shellPrompt": {
        "user": "your-name",
        "host": "machine",
        "symbol": ":~$"
      },
      "command": "clear",
      "timing": {
        "start": 6,
        "perChar": 0.2,
        "hold": 3
      }
    }
  ]
}
```

The structure includes:

- Global settings for the entire animation (dimensions, font, colors)
- An array of `steps` that define each scene in your animation
- Each step includes terminal lines, prompt configuration, command text, and timing

> [!TIP]
> When using JSONC, add comments to document your configuration choices, which is especially helpful for complex animations.

Save your configuration to a file with a `.json` or `.jsonc` extension, then run the build command passing your file with the `--config` flag.
