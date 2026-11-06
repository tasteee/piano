# @tasteee/sounds

A high-DX instrument API built on top of smplr, with note lifecycle state managed by datass.

## What It Solves

- Creates instruments from a remote descriptor URL.
- Supports both descriptor formats:
  - JSON (smplr JSON descriptor)
  - SFZ (parsed and converted to smplr JSON at runtime)
  - SF2 (SoundFont 2)
- Prevents hanging notes by stopping same-note replays before starting new voices.
- Adds per-note timeout cleanup for every started note.
- Supports deterministic or randomized velocity and delay.
- Exposes stock, ready-to-use instruments from smplr.

## Install

```bash
pnpm add @tasteee/sounds
```

## Import

```ts
import { instruments } from '@tasteee/sounds'
```

## API

### instruments.create(options)

Creates and loads a custom instrument from a remote URL.

```ts
type CreateInstrumentOptionsT = {
	name: string
	description?: string
	url: string
}
```

Returns:

```ts
Promise<ManagedInstrumentT>
```

The promise resolves after the underlying smplr instrument is ready.

### ManagedInstrumentT

```ts
type ManagedInstrumentT = {
	name: string
	description: string
	ready: Promise<void>
	play: (options: PlayOptionsT) => void
	stop: (...noteArguments: (string | string[])[]) => void
	getPlayingNotes: () => string[]
}
```

### PlayOptionsT

```ts
type PlayOptionsT = {
	notes: string[]
	duration?: number
	velocity?: number
	delay?: number
	minVelocity?: number
	maxVelocity?: number
	minDelay?: number
	maxDelay?: number
}
```

Rules:

- duration is in milliseconds.
- If duration is omitted, the module uses a safety timeout of 10000ms.
- velocity accepts either:
  - MIDI velocity 0-127, or
  - Decimal 0-1 (converted to MIDI by multiplying by 127).
- delay is in milliseconds.
- velocity has precedence over minVelocity and maxVelocity.
- delay has precedence over minDelay and maxDelay.

### stop signatures

All are supported:

```ts
instrument.stop('C4')
instrument.stop('C4', 'E4')
instrument.stop(['C4', 'E4'])
instrument.stop()
```

Behavior:

- Unknown notes are ignored.
- stop() with no args stops all currently playing notes.

## Usage

### Create a custom instrument

```ts
import { instruments } from '@tasteee/sounds'

const customInstrument = await instruments.create({
	name: 'Warm Strings',
	description: 'Custom remote descriptor',
	url: 'https://example.com/strings.sfz'
})

customInstrument.play({
	notes: ['C4', 'E4', 'G4'],
	duration: 1200,
	minVelocity: 0.55,
	maxVelocity: 0.82,
	minDelay: 0,
	maxDelay: 45
})
```

### Play with exact velocity and delay

```ts
customInstrument.play({
	notes: ['A3'],
	duration: 900,
	velocity: 96,
	delay: 12
})
```

### Stop notes

```ts
customInstrument.stop('C4')
customInstrument.stop(['E4', 'G4'])
customInstrument.stop()
```

### Inspect currently playing notes

```ts
const playingNotes = customInstrument.getPlayingNotes()
```

## Stock Instruments

The module prepares stock smplr instruments at runtime:

- instruments.stock.splendidGrandPiano
- instruments.stock.soundfontPiano
- instruments.stock.drumMachine808

Example:

```ts
import { instruments } from '@tasteee/sounds'

instruments.stock.splendidGrandPiano.play({
	notes: ['C4', 'E4', 'G4'],
	duration: 1000,
	velocity: 90
})
```

## Internal State

State is managed with datass stores:

- Per-instrument playing note state
- Created instrument registry (`instruments.created`)

This enables predictable note lifecycle handling and clean stop behavior without hanging voices.

## Notes

- Browsers often require user interaction before audio playback. The module attempts to resume the AudioContext when `play` is called.
- For SFZ inputs, sample buffers are preloaded and decoded before instrument readiness resolves.

## Browser only

The module creates a shared `AudioContext` on import, so it must run in the browser. In SSR frameworks, import it dynamically on the client.

## Develop

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm dev:demo
```
