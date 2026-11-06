# @tasteee/piano

A grand piano with a tiny API. Wraps [smplr](https://github.com/danigb/smplr)'s Splendid Grand Piano and the Web Audio setup.

```ts
import { piano } from '@tasteee/piano'

piano.play('C4')
```

Samples download on first use. Audio unlocks itself on the first call, so call `play` from a click or key handler.

## API

```ts
piano.play(notes, options?)    // notes: 'C4' | 60 | ['C4', 'E4', 'G4']
piano.stop(...notes)           // stop('C4'), stop('C4', 'E4'), stop(['C4', 'E4']), stop() for all
piano.getPlayingNotes()        // notes currently sounding
piano.sustain(true | false)    // sustain pedal
piano.load()                   // optional: preload samples, returns a Promise
piano.loaded                   // boolean
piano.volume = 0.8             // 0-1
```

## Play options

All are optional and shared by every note in the call. Random ranges are picked per note.

| Option                     | Default | Meaning                                         |
| -------------------------- | ------- | ----------------------------------------------- |
| `velocity`                 | `100`   | Exact velocity. `0-1`, or MIDI `1-127`          |
| `minVelocity` `maxVelocity`| none    | Random velocity range. `velocity` wins          |
| `delay`                    | `0`     | Exact delay in milliseconds                     |
| `minDelay` `maxDelay`      | none    | Random delay range in ms. `delay` wins          |
| `duration`                 | `10000` | Milliseconds until release. `Infinity` rings until `stop` |

## Hanging-note protection

- Replaying a note stops its previous voice first, so the same note never stacks.
- Every note releases after `duration`. The default is 10 seconds, so nothing rings forever by accident.
- `stop()` with no arguments stops everything. Unknown notes are ignored.
- Notes played before samples finish loading start as soon as they do.

## Examples

```ts
piano.play('C4')
piano.play(['C4', 'E4', 'G4'])
piano.play('C4', { velocity: 0.4 })
piano.play(['C4', 'E4', 'G4'], { velocity: 90, duration: 2000 })
piano.play('G4', { delay: 500 })

// humanized chord
piano.play(['C4', 'E4', 'G4'], {
	minVelocity: 0.55,
	maxVelocity: 0.82,
	minDelay: 0,
	maxDelay: 45,
	duration: 1200
})

// hold until stopped
piano.play('C4', { duration: Infinity })

piano.stop('C4')
piano.stop()

// computer keyboard
onkeydown = (event) => piano.play(keyToNote[event.key], { duration: Infinity })
onkeyup = (event) => piano.stop(keyToNote[event.key])

// MIDI input
midiInput.onmidimessage = ({ data: [status, note, velocity] }) => {
	if (status === 0x90 && velocity > 0) piano.play(note, { velocity, duration: Infinity })
	else piano.stop(note)
}
```

## Other instruments

`piano` is the Splendid Grand Piano. For anything else, pass any smplr instrument to `createInstrument`. It has the same API as `piano`.

```ts
import { createInstrument } from '@tasteee/piano'
import { Soundfont, DrumMachine } from 'smplr'

const violin = createInstrument({
	create: (context, settings) => Soundfont(context, { instrument: 'violin', ...settings })
})

const drums = createInstrument({
	create: (context, settings) => DrumMachine(context, { instrument: 'TR-808', ...settings })
})

violin.play('A4', { duration: 1000 })
drums.play('kick')
```

Instruments share one AudioContext and load lazily, like `piano`.

## Own AudioContext or mixer

```ts
import { createInstrument } from '@tasteee/piano'

const piano = createInstrument({ context, destination: myMixerNode, volume: 0.8 })
```
