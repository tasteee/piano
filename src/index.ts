import { SplendidGrandPiano } from 'smplr'
import { toMidi, toVelocity } from './notes'
import type { NoteT } from './notes'

export type { NoteT } from './notes'

export type PlayOptionsT = {
	/** 0-1, or MIDI 1-127. Default 100. */
	velocity?: number
	/** Seconds until the note releases. Default: rings until stopped. */
	duration?: number
	/** Seconds from now to start the note. Default 0. */
	at?: number
}

export type CreatePianoOptionsT = {
	/** Use your own AudioContext. Default: one is created on first use. */
	context?: AudioContext
	/** Route output to your own node. Default: context.destination. */
	destination?: AudioNode
	/** 0-1. Default 1. */
	volume?: number
}

export type PianoT = ReturnType<typeof createPiano>

const SUSTAIN_CC = 64

export const createPiano = (options: CreatePianoOptionsT = {}) => {
	let volume = options.volume ?? 1
	let context: AudioContext | undefined
	let engine: ReturnType<typeof SplendidGrandPiano> | undefined
	let loaded = false
	let loading: Promise<void> | undefined

	const getEngine = () => {
		if (engine) return engine
		context = options.context ?? new AudioContext()
		engine = SplendidGrandPiano(context, { destination: options.destination, volume: Math.round(volume * 127) })
		return engine
	}

	// Starts loading samples on first call. Safe to call again.
	const load = (): Promise<void> => {
		if (loading) return loading
		const instance = getEngine()
		loading = instance.ready.then(() => {
			loaded = true
		})
		return loading
	}

	// Runs now if samples are loaded, otherwise as soon as they are.
	// Browsers keep audio suspended until a user gesture; resume() unlocks it.
	const whenReady = (run: (instance: ReturnType<typeof getEngine>) => void) => {
		const instance = getEngine()
		if (context?.state === 'suspended') void context.resume()
		if (loaded) return run(instance)
		void load().then(() => run(instance))
	}

	const play = (notes: NoteT | NoteT[], playOptions: PlayOptionsT = {}) => {
		const list = Array.isArray(notes) ? notes : [notes]
		whenReady((instance) => {
			const time = instance.context.currentTime + (playOptions.at ?? 0)
			const velocity = playOptions.velocity === undefined ? undefined : toVelocity(playOptions.velocity)
			for (const note of list) {
				const midi = toMidi(note)
				instance.start({ note: midi, stopId: midi, velocity, time, duration: playOptions.duration })
			}
		})
	}

	const stop = (notes?: NoteT | NoteT[]) => {
		whenReady((instance) => {
			if (notes === undefined) return instance.stop()
			const list = Array.isArray(notes) ? notes : [notes]
			for (const note of list) instance.stop({ stopId: toMidi(note) })
		})
	}

	// Sustain pedal. While down, stopped notes keep ringing until it lifts.
	const sustain = (down: boolean) => {
		whenReady((instance) => instance.setCC(SUSTAIN_CC, down ? 127 : 0))
	}

	return {
		play,
		stop,
		sustain,
		load,
		get loaded() {
			return loaded
		},
		get volume() {
			return volume
		},
		set volume(next: number) {
			volume = Math.max(0, Math.min(1, next))
			if (engine) engine.output.setVolume(Math.round(volume * 127))
		}
	}
}

// Shared instance. Nothing is created or downloaded until first use.
export const piano = createPiano()
