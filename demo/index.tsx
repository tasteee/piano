import { createRoot } from 'react-dom/client'
import { instruments } from '../src'

const NOTES = [
	'C1',
	'C#1',
	'D1',
	'D#1',
	'E1',
	'F1',
	'F#1',
	'G1',
	'G#1',
	'A1',
	'A#1',
	'B1',

	'C2',
	'C#2',
	'D2',
	'D#2',
	'E2',
	'F2',
	'F#2',
	'G2',
	'G#2',
	'A2',
	'A#2',
	'B2',

	'C3',
	'C#3',
	'D3',
	'D#3',
	'E3',
	'F3',
	'F#3',
	'G3',
	'G#3',
	'A3',
	'A#3',
	'B3',

	'C4',
	'C#4',
	'D4',
	'D#4',
	'E4',
	'F4',
	'F#4',
	'G4',
	'G#4',
	'A4',
	'A#4',
	'B4',

	'C5',
	'C#5',
	'D5',
	'D#5',
	'E5',
	'F5',
	'F#5',
	'G5',
	'G#5',
	'A5',
	'A#5',
	'B5',

	'C6',
	'C#6',
	'D6',
	'D#6',
	'E6',
	'F6',
	'F#6',
	'G6',
	'G#6',
	'A6',
	'A#6',
	'B6'
]

const CHORDS = [
	{ name: 'F', notes: ['F3', 'A3', 'C4'] },
	{ name: 'Fm', notes: ['F3', 'G#3', 'C4'] },
	{ name: 'Fdim', notes: ['F3', 'G#3', 'B3'] },
	{ name: 'Faug', notes: ['F3', 'A3', 'C#4'] },
	{ name: 'Fsus2', notes: ['F3', 'G3', 'C4'] },
	{ name: 'Fsus4', notes: ['F3', 'A#3', 'C4'] },
	{ name: 'Fmaj7', notes: ['F3', 'A3', 'C4', 'E4'] },
	{ name: 'Fm7', notes: ['F3', 'G#3', 'C4', 'D#4'] },
	{ name: 'F7', notes: ['F3', 'A3', 'C4', 'D#4'] },
	{ name: 'Fdim7', notes: ['F3', 'G#3', 'B3', 'D4'] },
	{ name: 'Fm7b5', notes: ['F3', 'G#3', 'B3', 'D#4'] },
	{ name: 'Fadd9', notes: ['F3', 'A3', 'C4', 'G4'] },
	{ name: 'Fmadd9', notes: ['F3', 'G#3', 'C4', 'G4'] },
	{ name: 'Fmaj9', notes: ['F3', 'A3', 'C4', 'E4', 'G4'] },
	{ name: 'Fm9', notes: ['F3', 'G#3', 'C4', 'D#4', 'G4'] },
	{ name: 'F9', notes: ['F3', 'A3', 'C4', 'D#4', 'G4'] },
	{ name: 'F11', notes: ['F3', 'A3', 'C4', 'D#4', 'G4', 'A#4'] },
	{ name: 'Fm11', notes: ['F3', 'G#3', 'C4', 'D#4', 'G4', 'A#4'] },
	{ name: 'Fmaj11', notes: ['F3', 'A3', 'C4', 'E4', 'G4', 'A#4'] },
	{ name: 'F13', notes: ['F3', 'A3', 'C4', 'D#4', 'G4', 'A#4', 'D5'] },
	{ name: 'Fmaj13', notes: ['F3', 'A3', 'C4', 'E4', 'G4', 'A#4', 'D5'] },
	{ name: 'Fm13', notes: ['F3', 'G#3', 'C4', 'D#4', 'G4', 'A#4', 'D5'] }
]

const main = async () => {
	const sadPiano = await instruments.create({
		name: 'custom instrument',
		url: new URL('./Sad Piano.sf2', import.meta.url).href,
		description: 'test'
	})

	const violin = await instruments.create({
		name: 'violin instrument',
		url: new URL('./ViolinCLASS.sf2', import.meta.url).href,
		description: 'test'
	})

	const instrument = instruments.stock.splendidGrandPiano

	const Demo = () => {
		return (
			<div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 48 }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					<h2 style={{ margin: 0, fontSize: 24 }}>Single Notes</h2>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
						{NOTES.map((note) => {
							const handleClick = () => {
								console.log(`Clicked note: ${note}`)

								instrument.play({ notes: [note], velocity: 55, delay: 12, duration: 600 })
							}

							return (
								<button
									key={note}
									onClick={handleClick}
									style={{
										padding: '12px 16px',
										fontSize: '20px',
										fontWeight: 700,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										borderRadius: 4,
										border: '1px solid #ccc',
										backgroundColor: '#fff',
										cursor: 'pointer'
									}}
								>
									{note}
								</button>
							)
						})}
					</div>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					<h2 style={{ margin: 0, fontSize: 24 }}>F Chords</h2>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
						{CHORDS.map((chord) => {
							const handleClick = () => {
								console.log(`Clicked chord: ${chord.name}`)

								instrument.play({
									notes: chord.notes,
									minVelocity: 55,
									maxVelocity: 85,
									minDelay: 15,
									maxDelay: 57,
									duration: 1200
								})
							}

							return (
								<button
									key={chord.name}
									onClick={handleClick}
									style={{
										padding: '12px 16px',
										fontSize: '20px',
										fontWeight: 700,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										borderRadius: 4,
										border: '1px solid #ccc',
										backgroundColor: '#fff',
										cursor: 'pointer'
									}}
								>
									{chord.name}
								</button>
							)
						})}
					</div>
				</div>
			</div>
		)
	}

	const element = document.getElementById('root')
	const root = createRoot(element as HTMLElement)

	root.render(<Demo />)
}

main()
