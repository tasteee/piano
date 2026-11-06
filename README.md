# @tasteee/sounds

A grand piano with a tiny API. Wraps [smplr](https://github.com/danigb/smplr)'s Splendid Grand Piano and the Web Audio setup.

```ts
import { piano } from '@tasteee/sounds'

piano.play('C4')
```

Samples download on first use. Audio unlocks itself on the first call, so call `play` from a click or key handler.

## API

```ts
piano.play(notes, options?)   // notes: 'C4' | 60 | ['C4', 'E4', 'G4']
piano.stop(notes?)            // no argument stops everything
piano.sustain(true | false)   // sustain pedal
piano.load()                  // optional: preload samples, returns a Promise
piano.loaded                  // boolean
piano.volume = 0.8            // 0-1
```

Options for `play` are shared by every note in the call. All are optional.

| Option     | Default      | Meaning                |
| ---------- | ------------ | ---------------------- |
| `velocity` | `100`        | `0-1`, or MIDI `1-127` |
| `duration` | until `stop` | seconds until release  |
| `at`       | `0`          | seconds from now       |

## Examples

```ts
piano.play('C4')
piano.play(['C4', 'E4', 'G4'])
piano.play('C4', { velocity: 0.4 })
piano.play(['C4', 'E4', 'G4'], { velocity: 90, duration: 2 })
piano.play('G4', { at: 0.5 })

piano.stop('C4')
piano.stop()

// computer keyboard
onkeydown = (event) => piano.play(keyToNote[event.key])
onkeyup = (event) => piano.stop(keyToNote[event.key])

// MIDI input
midiInput.onmidimessage = ({ data: [status, note, velocity] }) => {
	if (status === 0x90 && velocity > 0) piano.play(note, { velocity })
	else piano.stop(note)
}
```

For different velocities, call `play` once per velocity.

## Own AudioContext or mixer

```ts
import { createPiano } from '@tasteee/sounds'

const piano = createPiano({ context, destination: myMixerNode, volume: 0.8 })
```
