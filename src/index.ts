import { SplendidGrandPiano } from 'smplr'
import type { Smplr } from 'smplr'
import { toNote, toVelocity } from './notes'
import type { NoteT } from './notes'

export type { NoteT } from './notes'

const DEFAULT_DURATION_MILLISECONDS = 10000
const DEFAULT_VELOCITY = 100
const MILLISECONDS_PER_SECOND = 1000
const SUSTAIN_CC = 64

export type PlayOptionsT = {
	/** Exact velocity. 0-1, or MIDI 1-127. Beats min/max. Default 100. */
	velocity?: number
	/** Random velocity range, picked per note. */
	minVelocity?: number
	maxVelocity?: number
	/** Exact delay in milliseconds. Beats min/max. Default 0. */
	delay?: number
	/** Random delay range in milliseconds, picked per note. */
	minDelay?: number
	maxDelay?: number
	/** Milliseconds until release. Default 10000. Infinity rings until stopped. */
	duration?: number
}

export type StopArgumentT = NoteT | NoteT[]

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

type PlayingNoteT = {
	noteName: NoteT
	cleanupTimer: ReturnType<typeof setTimeout> | undefined
}

const createSplendidPiano: CreateEngineT = (context, settings) => SplendidGrandPiano(context, settings)

// One AudioContext for every instrument. Browsers cap how many can exist.
let sharedContext: AudioContext | undefined
const getSharedContext = () => (sharedContext ??= new AudioContext())

const clampMilliseconds = (value: number): number => Math.max(0, value)

const pickRandomBetween = (minimum: number, maximum: number): number => {
	const isRangeBackwards = maximum < minimum
	if (isRangeBackwards) return minimum
	return minimum + Math.random() * (maximum - minimum)
}

const resolveVelocity = (options: PlayOptionsT): number => {
	const hasExactVelocity = options.velocity !== undefined
	if (hasExactVelocity) return toVelocity(options.velocity as number)

	const hasVelocityRange = options.minVelocity !== undefined && options.maxVelocity !== undefined
	if (hasVelocityRange) return toVelocity(pickRandomBetween(options.minVelocity as number, options.maxVelocity as number))

	return DEFAULT_VELOCITY
}

const resolveDelayMilliseconds = (options: PlayOptionsT): number => {
	const hasExactDelay = options.delay !== undefined
	if (hasExactDelay) return clampMilliseconds(options.delay as number)

	const hasDelayRange = options.minDelay !== undefined && options.maxDelay !== undefined
	if (hasDelayRange) return clampMilliseconds(pickRandomBetween(options.minDelay as number, options.maxDelay as number))

	return 0
}

const resolveDurationMilliseconds = (options: PlayOptionsT): number => {
	const hasDuration = options.duration !== undefined
	if (hasDuration) return clampMilliseconds(options.duration as number)
	return DEFAULT_DURATION_MILLISECONDS
}

const flattenNotes = (notes: StopArgumentT[]): NoteT[] => notes.flat()

export const createInstrument = (options: CreateInstrumentOptionsT = {}) => {
	const createEngine = options.create ?? createSplendidPiano
	let volume = options.volume ?? 1
	let context: AudioContext | undefined
	let engine: Smplr | undefined
	let loaded = false
	let loading: Promise<void> | undefined
	const playingNotes = new Map<number | string, PlayingNoteT>()

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
	const whenReady = (run: (instance: Smplr) => void) => {
		const instance = getEngine()
		if (context?.state === 'suspended') void context.resume()
		if (loaded) return run(instance)
		void load().then(() => run(instance))
	}

	const forgetNote = (noteKey: number | string) => {
		const playing = playingNotes.get(noteKey)
		if (!playing) return
		clearTimeout(playing.cleanupTimer)
		playingNotes.delete(noteKey)
	}

	const stopOneNote = (instance: Smplr, note: NoteT) => {
		const noteKey = toNote(note)
		const isPlaying = playingNotes.has(noteKey)
		if (!isPlaying) return
		instance.stop({ stopId: noteKey })
		forgetNote(noteKey)
	}

	const startOneNote = (instance: Smplr, note: NoteT, playOptions: PlayOptionsT) => {
		const noteKey = toNote(note)
		// Replaying a note cuts the old voice so it can never hang.
		stopOneNote(instance, note)

		const velocity = resolveVelocity(playOptions)
		const delayMilliseconds = resolveDelayMilliseconds(playOptions)
		const durationMilliseconds = resolveDurationMilliseconds(playOptions)
		const hasNoTimeout = durationMilliseconds === Infinity
		const startTime = instance.context.currentTime + delayMilliseconds / MILLISECONDS_PER_SECOND
		const durationSeconds = hasNoTimeout ? undefined : durationMilliseconds / MILLISECONDS_PER_SECOND

		instance.start({ note: noteKey, stopId: noteKey, velocity, time: startTime, duration: durationSeconds })

		const cleanupTimer = hasNoTimeout
			? undefined
			: setTimeout(() => forgetNote(noteKey), delayMilliseconds + durationMilliseconds)
		playingNotes.set(noteKey, { noteName: note, cleanupTimer })
	}

	const play = (notes: NoteT | NoteT[], playOptions: PlayOptionsT = {}) => {
		const noteList = Array.isArray(notes) ? notes : [notes]
		whenReady((instance) => {
			for (const note of noteList) startOneNote(instance, note, playOptions)
		})
	}

	// stop('C4'), stop('C4', 'E4'), stop(['C4', 'E4']), stop() for all.
	const stop = (...notes: StopArgumentT[]) => {
		const noteList = flattenNotes(notes)
		const shouldStopEverything = noteList.length === 0
		whenReady((instance) => {
			if (shouldStopEverything) {
				for (const noteKey of [...playingNotes.keys()]) forgetNote(noteKey)
				return instance.stop()
			}
			for (const note of noteList) stopOneNote(instance, note)
		})
	}

	const getPlayingNotes = (): NoteT[] => [...playingNotes.values()].map((playing) => playing.noteName)

	// Sustain pedal. While down, stopped notes keep ringing until it lifts.
	const sustain = (down: boolean) => {
		whenReady((instance) => instance.setCC(SUSTAIN_CC, down ? 127 : 0))
	}

	return {
		play,
		stop,
		sustain,
		getPlayingNotes,
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
