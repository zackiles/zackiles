# Setup Your Own Animation

Make your own terminal svg / gif!

## Quick Start

1. [Install Deno](https://docs.deno.com/runtime/getting_started/installation/) (If you haven't already)

2. Install ffmpeg:

```sh
brew install ffmpeg
```

3. Clone this repo and run this command in it:

```sh
deno task install:playwright
```

4. Edit either the Typescript or the JSON config and run:

```sh
deno run -A build.ts --config examples/config.ts
```

**That's it**. You should have the following in the same path:

- `index.html`
- `index.svg`
- `index.gif`

Hack the planet.

## Configuring The Animation

At a high-level, the core parts of the animation are broken down into "steps" and global configuration, and you can configure essentially every aspect of the entire animation in either a Typescript/Javascript or JSON file.

Once you've finished your configuration file you'll be ready to build your animation by passing the path of it to the builder using `--config`.

> [!TIP]
> Full examples both types of configuration can be found in `examples/`. Explanations of each option is explained below.

### Step Configuration

Configure one or as many steps as you'd like. All steps share a similar set of options:

- `terminalLines`: what shows in the terminal for that step (e.g a list of directories)
- `shellPrompt`: what shows as the terminal prompt for that step (e.g `user@machine`)
- `command`: what is being typed into the terminal for that step. NOTE: this is typically the command that you'd expect the **next** step to show the result of in the terminal lines
- `timings`: a set of timings for that step (e.g typing speed, holding time etc)

### Global Configuration

The entire animation uses these global configuration options:

- `name`: The name (without extension) to be used for the build files (i.e `{name}.html`, `{name}.svg`, `{name}.gif`)
  - Default: 'animation'
- `outputDirectory`: Path of where to build the files to. NOTE: This will be overridden if the flag `--output-directory` is provided to the builder
  - Default: current working directory
- `outputTypes`: An array of strings for all build file types you'd like. Options are `html`, `svg`, `gif`.
  - Default: All types are built
- `embed`: When html is provided as a build type, this chooses whether the svg should be embedded in the html or built as a separate file and linked in it with an img tag. NOTE: setting embed to true will force an svg to be built even if you didn't include it in outputTypes.
  - Default: false
- `width`: The total width of the SVG animation in pixels. Determines the horizontal size of the terminal window.
  - Default: 800
- `height`: The total height of the SVG animation in pixels. Determines the vertical size of the terminal window.
  - Default 200
- `fontFamily`: The font used for rendering text in the terminal. Defaults to monospace fonts like "Courier New" for a classic terminal look.
  - Default: 'Courier New, monospace'
- `fontSize`: The size of the text in pixels. Controls the readability and visual scale of the terminal text.
  - Default: 18
- `loop`: A boolean flag that determines whether the animation should repeat indefinitely. When `true`, the animation will restart after completing all steps.
  - Default: true

### Using Javascript/Typescript

Your file can export a default plain object (see Using JSON for an example of what that object would look like), OR it can leverage the handy `Composer` class to fluently build a config:

```ts
import { Composer } from '../composer.ts'

// Create configuration using the Composer fluent API
const composer = new Composer({
  // Optional: Override default global settings
  width: 800,
  height: 200,
  fontFamily: 'Courier New, monospace',
  fontSize: 18,
  loop: true, // Set to true for infinite animation loops
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

The Composer API offers several key advantages:

- Type checking and autocompletion in your IDE
- Chainable interface for building complex animations
- Reusable code patterns for similar steps
- Easy to programmatically generate steps

## Using JSON(c)

For a simpler approach, you can define your configuration directly in JSON or JSONC (JSON with comments):

```json
{
  "width": 800,
  "height": 200,
  "fontFamily": "Courier New, monospace",
  "fontSize": 18,
  "loop": true,
  "colors": {
    "bg": "black",
    "terminalLines": "#00FF00",
    "user": "#00ffff",
    "host": "#ffaa00",
    "path": "#ffaa00",
    "symbol": "#ffffff",
    "command": "#ffffff"
  },
  "charWidth": 11,
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
> When using JSONC, you can add comments to document your configuration choices,
> which is especially helpful for complex animations.

Save your configuration to a file with `.json` or `.jsonc` extension, then run the
build command passing your file with the `--config` flag.
