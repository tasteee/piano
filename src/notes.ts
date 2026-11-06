export type NoteT = string | number

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// 'C4' -> 60, 'F#3' -> 54, 'Bb2' -> 46. Numbers pass through.
export const toMidi = (note: NoteT): number => {
	if (typeof note === 'number') return Math.round(note)
	const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim())
	if (!match) throw new Error(`piano: invalid note "${note}"`)
	const letter = match[1].toUpperCase()
	const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
	const octave = Number(match[3])
	return (octave + 1) * 12 + SEMITONES[letter] + accidental
}

// 0-1 is treated as a fraction, anything above as MIDI 1-127.
export const toVelocity = (velocity: number): number => {
	const midi = velocity <= 1 ? velocity * 127 : velocity
	return Math.max(1, Math.min(127, Math.round(midi)))
}

const NOTE_PATTERN = /^([A-Ga-g])([#b]?)(-?\d+)$/

// Pitches become MIDI numbers. Other names ('kick', 'snare')
// pass through for instruments that use sample names.
export const toNote = (note: NoteT): number | string => {
	const isPitch = typeof note === 'number' || NOTE_PATTERN.test(note.trim())
	if (isPitch) return toMidi(note)
	return note
}
