import { SplendidGrandPiano } from 'smplr'
import type { Smplr } from 'smplr'
import { toNote, toVelocity } from './notes'
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

export type EngineSettingsT = {
	destination?: AudioNode
	/** MIDI scale, 0-127. */
	volume: number
}

/** Builds any smplr instrument: Soundfont, DrumMachine, ElectricPiano... */
export type CreateEngineT = (context: AudioContext, settings: EngineSettingsT) => Smplr

export type CreateInstrumentOptionsT = {
	/** Which smplr instrument to use. Default: Splendid Grand Piano. */
	create?: CreateEngineT
	/** Use your own AudioContext. Default: one shared by all instruments, created on first use. */
	context?: AudioContext
	/** Route output to your own node. Default: context.destination. */
	destination?: AudioNode
	/** 0-1. Default 1. */
	volume?: number
}

export type InstrumentT = ReturnType<typeof createInstrument>
export type PianoT = InstrumentT
export type CreatePianoOptionsT = CreateInstrumentOptionsT

const SUSTAIN_CC = 64

const createSplendidPiano: CreateEngineT = (context, settings) => SplendidGrandPiano(context, settings)

// One AudioContext for every instrument. Browsers cap how many can exist.
let sharedContext: AudioContext | undefined
const getSharedContext = () => (sharedContext ??= new AudioContext())

export const createInstrument = (options: CreateInstrumentOptionsT = {}) => {
	const createEngine = options.create ?? createSplendidPiano
	let volume = options.volume ?? 1
	let context: AudioContext | undefined
	let engine: Smplr | undefined
	let loaded = false
	let loading: Promise<void> | undefined

	const getEngine = () => {
		if (engine) return engine
		context = options.context ?? getSharedContext()
		engine = createEngine(context, { destination: options.destination, volume: Math.round(volume * 127) })
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
				const resolvedNote = toNote(note)
				instance.start({ note: resolvedNote, stopId: resolvedNote, velocity, time, duration: playOptions.duration })
			}
		})
	}

	const stop = (notes?: NoteT | NoteT[]) => {
		whenReady((instance) => {
			if (notes === undefined) return instance.stop()
			const list = Array.isArray(notes) ? notes : [notes]
			for (const note of list) instance.stop({ stopId: toNote(note) })
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

// Same API, Splendid Grand Piano. Kept for the original name.
export const createPiano = createInstrument

// Default instance. Nothing is created or downloaded until first use.
export const piano = createInstrument()
