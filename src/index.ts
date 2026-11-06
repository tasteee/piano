import to from 'await-to-js'
import { datass } from 'datass'
import { Soundfont, Instrument, SplendidGrandPiano, DrumMachine, Soundfont2Sampler } from 'smplr'
import type { SmplrPreset } from 'smplr'
import { SoundFont2 } from 'soundfont2'

// smplr 1.x renamed SmplrJson to SmplrPreset.
type SmplrJsonT = SmplrPreset

const DEFAULT_DURATION_MILLISECONDS = 10000
const DEFAULT_MIDI_VELOCITY = 100
const DEFAULT_DELAY_MILLISECONDS = 0
const MILLISECONDS_PER_SECOND = 1000
const MIDI_VELOCITY_MINIMUM = 0
const MIDI_VELOCITY_MAXIMUM = 127

const FileFormat = {
	json: 'json',
	sfz: 'sfz',
	sf2: 'sf2'
} as const

type FileFormatT = (typeof FileFormat)[keyof typeof FileFormat]

const SfzSection = {
	global: 'global',
	group: 'group',
	region: 'region',
	control: 'control'
} as const

type SfzSectionT = (typeof SfzSection)[keyof typeof SfzSection]

const NoteLetterToSemitoneOffset = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11
} as const

type CreateInstrumentOptionsT = {
	name: string
	description?: string
	url: string
}

export type PlayOptionsT = {
	notes: string[]
	duration?: number
	velocity?: number
	delay?: number
	minVelocity?: number
	maxVelocity?: number
	minDelay?: number
	maxDelay?: number
}

type StopArgumentT = string | string[]

type PlayingNoteStateT = {
	noteName: string
	startedAtSeconds: number
	velocityMidi: number
	delayMilliseconds: number
	timeoutIdentifier: ReturnType<typeof setTimeout> | null
	stopPlayback: ((time?: number) => void) | null
}

type PlayingNotesStateT = Record<string, PlayingNoteStateT>

type ManagedInstrumentT = {
	name: string
	description: string
	ready: Promise<void>
	play: (options: PlayOptionsT) => void
	stop: (...noteArguments: StopArgumentT[]) => void
	getPlayingNotes: () => string[]
}

type PluginSmplrT = {
	loadInstrument: (
		jsonDescriptor: SmplrJsonT,
		preloadedAudioBuffers?: Map<string, AudioBuffer>
	) => Promise<void>
}

type SfzPropertyValueT = string | number
type SfzPropertyMapT = Record<string, SfzPropertyValueT>

type SfzHeaderTokenT = {
	tokenType: 'header'
	sectionName: SfzSectionT
}

type SfzPropertyTokenT = {
	tokenType: 'property'
	propertyName: string
	propertyValue: SfzPropertyValueT
}

type SfzTokenT = SfzHeaderTokenT | SfzPropertyTokenT

type SfzConversionResultT = {
	jsonDescriptor: SmplrJsonT
	sampleFileUrlBySampleName: Record<string, string>
}

type RemoteInstrumentLoaderOptionsT = {
	resourceUrl: string
}

type BuildManagedInstrumentOptionsT = {
	name: string
	description?: string
	smplrInstrument: import('smplr').Smplr
}

type BuildJsonDescriptorFromSfzOptionsT = {
	sfzText: string
	sfzUrl: string
}

const sharedAudioContext = new AudioContext()

const createdInstrumentsStore = datass.array<ManagedInstrumentT>([])

const clampNumber = (value: number, minimumValue: number, maximumValue: number): number => {
	const isBelowMinimum = value < minimumValue
	if (isBelowMinimum) return minimumValue

	const isAboveMaximum = value > maximumValue
	if (isAboveMaximum) return maximumValue

	return value
}

const sanitizeMilliseconds = (value: number): number => {
	const isNegativeValue = value < 0
	if (isNegativeValue) return 0

	return value
}

const resolveVelocityToMidi = (value: number): number => {
	const isDecimalVelocity = value <= 1
	if (isDecimalVelocity) {
		const clampedDecimalValue = clampNumber(value, 0, 1)
		const midiVelocity = Math.round(clampedDecimalValue * MIDI_VELOCITY_MAXIMUM)
		return midiVelocity
	}

	const clampedMidiVelocity = clampNumber(value, MIDI_VELOCITY_MINIMUM, MIDI_VELOCITY_MAXIMUM)
	const roundedMidiVelocity = Math.round(clampedMidiVelocity)
	return roundedMidiVelocity
}

const createRandomNumber = (minimumValue: number, maximumValue: number): number => {
	const isMaximumBelowMinimum = maximumValue < minimumValue
	if (isMaximumBelowMinimum) return minimumValue

	const randomValue = Math.random()
	const rangedValue = minimumValue + randomValue * (maximumValue - minimumValue)
	return rangedValue
}

const resolveVelocityForNote = (options: PlayOptionsT): number => {
	const hasExactVelocity = options.velocity !== undefined
	if (hasExactVelocity) {
		const exactVelocity = options.velocity as number
		return resolveVelocityToMidi(exactVelocity)
	}

	const hasMinimumVelocity = options.minVelocity !== undefined
	const hasMaximumVelocity = options.maxVelocity !== undefined
	const hasVelocityRange = hasMinimumVelocity && hasMaximumVelocity
	if (hasVelocityRange) {
		const minimumVelocity = options.minVelocity as number
		const maximumVelocity = options.maxVelocity as number
		const randomVelocity = createRandomNumber(minimumVelocity, maximumVelocity)
		const midiVelocity = resolveVelocityToMidi(randomVelocity)
		return midiVelocity
	}

	return DEFAULT_MIDI_VELOCITY
}

const resolveDelayForNoteMilliseconds = (options: PlayOptionsT): number => {
	const hasExactDelay = options.delay !== undefined
	if (hasExactDelay) {
		const exactDelay = options.delay as number
		return sanitizeMilliseconds(exactDelay)
	}

	const hasMinimumDelay = options.minDelay !== undefined
	const hasMaximumDelay = options.maxDelay !== undefined
	const hasDelayRange = hasMinimumDelay && hasMaximumDelay
	if (hasDelayRange) {
		const minimumDelay = options.minDelay as number
		const maximumDelay = options.maxDelay as number
		const randomDelay = createRandomNumber(minimumDelay, maximumDelay)
		return sanitizeMilliseconds(randomDelay)
	}

	return DEFAULT_DELAY_MILLISECONDS
}

const resolveDurationMilliseconds = (options: PlayOptionsT): number => {
	const hasDuration = options.duration !== undefined
	if (hasDuration) {
		const providedDuration = options.duration as number
		return sanitizeMilliseconds(providedDuration)
	}

	return DEFAULT_DURATION_MILLISECONDS
}

const createError = (message: string): Error => {
	return new Error(message)
}

const removeHashFragmentFromUrl = (url: string): string => {
	const hashIndex = url.indexOf('#')
	const hasHashFragment = hashIndex !== -1
	if (hasHashFragment) {
		const withoutHashFragment = url.slice(0, hashIndex)
		return withoutHashFragment
	}

	return url
}

const removeSearchFromUrl = (url: string): string => {
	const searchIndex = url.indexOf('?')
	const hasSearchSegment = searchIndex !== -1
	if (hasSearchSegment) {
		const withoutSearchSegment = url.slice(0, searchIndex)
		return withoutSearchSegment
	}

	return url
}

const normalizeResourceUrlForExtensionChecks = (url: string): string => {
	const urlWithoutHashFragment = removeHashFragmentFromUrl(url)
	const urlWithoutSearchSegment = removeSearchFromUrl(urlWithoutHashFragment)
	const normalizedUrl = urlWithoutSearchSegment.toLowerCase()
	return normalizedUrl
}

const detectFileFormat = (url: string): FileFormatT | null => {
	const normalizedUrl = normalizeResourceUrlForExtensionChecks(url)
	const isJsonUrl = normalizedUrl.endsWith('.json')
	if (isJsonUrl) return FileFormat.json

	const isSfzUrl = normalizedUrl.endsWith('.sfz')
	if (isSfzUrl) return FileFormat.sfz

	const isSf2Url = normalizedUrl.endsWith('.sf2')
	if (isSf2Url) return FileFormat.sf2

	return null
}

const getBaseUrlFromResourceUrl = (url: string): string => {
	const urlWithoutHashFragment = removeHashFragmentFromUrl(url)
	const urlWithoutSearchSegment = removeSearchFromUrl(urlWithoutHashFragment)
	const lastSlashIndex = urlWithoutSearchSegment.lastIndexOf('/')
	const hasSlashSeparator = lastSlashIndex !== -1
	if (hasSlashSeparator) {
		const baseUrl = urlWithoutSearchSegment.slice(0, lastSlashIndex + 1)
		return baseUrl
	}

	return urlWithoutSearchSegment
}

const normalizePathSeparators = (value: string): string => {
	const normalizedValue = value.replace(/\\/g, '/')
	return normalizedValue
}

const trimQuotes = (value: string): string => {
	const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"')
	if (hasDoubleQuotes) {
		const unquotedValue = value.slice(1, value.length - 1)
		return unquotedValue
	}

	return value
}

const stripFileExtension = (value: string): string => {
	const extensionMatch = value.match(/\.[^/.]+$/)
	const hasExtension = extensionMatch !== null
	if (hasExtension) {
		const strippedValue = value.slice(0, value.length - extensionMatch[0].length)
		return strippedValue
	}

	return value
}

const isAbsoluteHttpUrl = (value: string): boolean => {
	const lowerCaseValue = value.toLowerCase()
	const hasHttpProtocol = lowerCaseValue.startsWith('http://')
	if (hasHttpProtocol) return true

	const hasHttpsProtocol = lowerCaseValue.startsWith('https://')
	if (hasHttpsProtocol) return true

	return false
}

const toAbsoluteUrl = (baseUrl: string, relativeOrAbsolutePath: string): string => {
	const isAlreadyAbsolute = isAbsoluteHttpUrl(relativeOrAbsolutePath)
	if (isAlreadyAbsolute) return relativeOrAbsolutePath

	const absoluteUrl = new URL(relativeOrAbsolutePath, baseUrl).toString()
	return absoluteUrl
}

const mergePropertyMaps = (firstMap: SfzPropertyMapT, secondMap: SfzPropertyMapT): SfzPropertyMapT => {
	const mergedMap: SfzPropertyMapT = {}

	const firstMapKeys = Object.keys(firstMap)
	for (let firstMapKeyIndex = 0; firstMapKeyIndex < firstMapKeys.length; firstMapKeyIndex += 1) {
		const propertyName = firstMapKeys[firstMapKeyIndex]
		const propertyValue = firstMap[propertyName]
		mergedMap[propertyName] = propertyValue
	}

	const secondMapKeys = Object.keys(secondMap)
	for (let secondMapKeyIndex = 0; secondMapKeyIndex < secondMapKeys.length; secondMapKeyIndex += 1) {
		const propertyName = secondMapKeys[secondMapKeyIndex]
		const propertyValue = secondMap[propertyName]
		mergedMap[propertyName] = propertyValue
	}

	return mergedMap
}

const resolveSfzDefines = (sfzText: string): string => {
	const defineValueByName: Record<string, string> = {}
	const outputLineList: string[] = []
	const lineList = sfzText.split('\n')

	for (let lineIndex = 0; lineIndex < lineList.length; lineIndex += 1) {
		const rawLine = lineList[lineIndex]
		const trimmedLine = rawLine.trim()
		const defineMatch = trimmedLine.match(/^#define\s+(\$\w+)\s+(.+)$/)
		const hasDefine = defineMatch !== null
		if (hasDefine) {
			const defineName = defineMatch[1]
			const defineValue = defineMatch[2].trim()
			defineValueByName[defineName] = defineValue
		}

		const doesNotHaveDefine = !hasDefine
		if (doesNotHaveDefine) {
			outputLineList.push(rawLine)
		}
	}

	let resolvedText = outputLineList.join('\n')
	const defineNameList = Object.keys(defineValueByName)
	for (let defineIndex = 0; defineIndex < defineNameList.length; defineIndex += 1) {
		const defineName = defineNameList[defineIndex]
		const defineValue = defineValueByName[defineName]
		resolvedText = resolvedText.split(defineName).join(defineValue)
	}

	return resolvedText
}

const parseSfzHeaderName = (value: string): SfzSectionT | null => {
	const normalizedValue = value.trim().toLowerCase()
	const isGlobalHeader = normalizedValue === SfzSection.global
	if (isGlobalHeader) return SfzSection.global

	const isGroupHeader = normalizedValue === SfzSection.group
	if (isGroupHeader) return SfzSection.group

	const isRegionHeader = normalizedValue === SfzSection.region
	if (isRegionHeader) return SfzSection.region

	const isControlHeader = normalizedValue === SfzSection.control
	if (isControlHeader) return SfzSection.control

	return null
}

const tokenizeSfzText = (sfzText: string): SfzTokenT[] => {
	const tokenList: SfzTokenT[] = []
	const lineList = sfzText.split('\n')

	for (let lineIndex = 0; lineIndex < lineList.length; lineIndex += 1) {
		const lineWithSlashCommentsRemoved = lineList[lineIndex].replace(/\/\/.*$/, '')
		const lineWithSemicolonCommentsRemoved = lineWithSlashCommentsRemoved.replace(/;.*$/, '')
		const trimmedLine = lineWithSemicolonCommentsRemoved.trim()
		const isLineEmpty = trimmedLine.length === 0
		if (isLineEmpty) continue

		const headerPattern = /<([^>]+)>/g
		let headerMatch = headerPattern.exec(trimmedLine)
		while (headerMatch !== null) {
			const rawHeaderName = headerMatch[1]
			const parsedHeaderName = parseSfzHeaderName(rawHeaderName)
			const isKnownHeaderName = parsedHeaderName !== null
			if (isKnownHeaderName) {
				const headerToken: SfzHeaderTokenT = {
					tokenType: 'header',
					sectionName: parsedHeaderName as SfzSectionT
				}
				tokenList.push(headerToken)
			}
			headerMatch = headerPattern.exec(trimmedLine)
		}

		const propertyPattern = /([A-Za-z0-9_]+)=((?:"[^"]*")|[^\s]+)/g
		let propertyMatch = propertyPattern.exec(trimmedLine)
		while (propertyMatch !== null) {
			const propertyName = propertyMatch[1]
			const rawPropertyValue = propertyMatch[2]
			const normalizedPropertyValue = trimQuotes(rawPropertyValue)
			const numericPropertyValue = Number(normalizedPropertyValue)
			const isNumericValue = Number.isNaN(numericPropertyValue) === false

			let finalPropertyValue: SfzPropertyValueT = normalizedPropertyValue
			if (isNumericValue) {
				finalPropertyValue = numericPropertyValue
			}

			const propertyToken: SfzPropertyTokenT = {
				tokenType: 'property',
				propertyName: propertyName,
				propertyValue: finalPropertyValue
			}
			tokenList.push(propertyToken)
			propertyMatch = propertyPattern.exec(trimmedLine)
		}
	}

	return tokenList
}

const readStringProperty = (properties: SfzPropertyMapT, propertyName: string): string | undefined => {
	const value = properties[propertyName]
	const isStringValue = typeof value === 'string'
	if (isStringValue) return value

	return undefined
}

const readNumberProperty = (properties: SfzPropertyMapT, propertyName: string): number | undefined => {
	const value = properties[propertyName]
	const isNumberValue = typeof value === 'number'
	if (isNumberValue) return value

	const isStringValue = typeof value === 'string'
	if (isStringValue) {
		const parsedNumberValue = Number(value)
		const isParsedNumberValid = Number.isNaN(parsedNumberValue) === false
		if (isParsedNumberValid) return parsedNumberValue
	}

	return undefined
}

const readAmpVelocityCurve = (properties: SfzPropertyMapT): [number, number] | undefined => {
	const propertyNameList = Object.keys(properties)
	for (let propertyIndex = 0; propertyIndex < propertyNameList.length; propertyIndex += 1) {
		const propertyName = propertyNameList[propertyIndex]
		const hasVelocityCurvePrefix = propertyName.startsWith('amp_velcurve_')
		if (!hasVelocityCurvePrefix) continue

		const velocitySegment = propertyName.slice('amp_velcurve_'.length)
		const velocityValue = Number(velocitySegment)
		const isVelocityValueValid = Number.isNaN(velocityValue) === false
		if (!isVelocityValueValid) continue

		const curveValue = readNumberProperty(properties, propertyName)
		const hasCurveValue = curveValue !== undefined
		if (!hasCurveValue) continue

		const curvePair: [number, number] = [velocityValue, curveValue as number]
		return curvePair
	}

	return undefined
}

const parseMidiFromNoteName = (noteName: string): number | undefined => {
	const trimmedNoteName = noteName.trim()
	const noteMatch = trimmedNoteName.match(/^([A-Ga-g])([#b]?)(-?\d+)$/)
	const hasMatchedPattern = noteMatch !== null
	if (!hasMatchedPattern) return undefined

	const noteLetter = noteMatch[1].toUpperCase() as keyof typeof NoteLetterToSemitoneOffset
	const accidental = noteMatch[2]
	const octave = Number(noteMatch[3])
	const octaveIsInvalid = Number.isNaN(octave)
	if (octaveIsInvalid) return undefined

	const baseSemitone = NoteLetterToSemitoneOffset[noteLetter]
	let accidentalOffset = 0
	const isSharp = accidental === '#'
	if (isSharp) accidentalOffset = 1

	const isFlat = accidental === 'b'
	if (isFlat) accidentalOffset = -1

	const midiValue = (octave + 1) * 12 + baseSemitone + accidentalOffset
	const clampedMidiValue = clampNumber(midiValue, 0, 127)
	return clampedMidiValue
}

const readMidiProperty = (properties: SfzPropertyMapT, propertyName: string): number | undefined => {
	const numericValue = readNumberProperty(properties, propertyName)
	const hasNumericValue = numericValue !== undefined
	if (hasNumericValue) {
		const clampedNumericValue = clampNumber(numericValue as number, 0, 127)
		const roundedNumericValue = Math.round(clampedNumericValue)
		return roundedNumericValue
	}

	const stringValue = readStringProperty(properties, propertyName)
	const hasStringValue = stringValue !== undefined
	if (hasStringValue) {
		const parsedMidiValue = parseMidiFromNoteName(stringValue as string)
		return parsedMidiValue
	}

	return undefined
}

const ensureSamplePathHasExtension = (samplePath: string): string => {
	const extensionMatch = samplePath.match(/\.[^/.]+$/)
	const hasExtension = extensionMatch !== null
	if (hasExtension) return samplePath

	const withDefaultExtension = `${samplePath}.wav`
	return withDefaultExtension
}

const joinSfzPaths = (firstPath: string, secondPath: string): string => {
	const normalizedFirstPath = normalizePathSeparators(firstPath)
	const normalizedSecondPath = normalizePathSeparators(secondPath)
	const doesFirstPathEndWithSlash = normalizedFirstPath.endsWith('/')
	if (doesFirstPathEndWithSlash) {
		const joinedPath = `${normalizedFirstPath}${normalizedSecondPath}`
		return joinedPath
	}

	const joinedPath = `${normalizedFirstPath}/${normalizedSecondPath}`
	return joinedPath
}

const buildSmplrGroupFromSfzProperties = (properties: SfzPropertyMapT): import('smplr').SmplrGroup => {
	const group: import('smplr').SmplrGroup = {
		regions: []
	}

	const minimumKey = readMidiProperty(properties, 'lokey')
	const maximumKey = readMidiProperty(properties, 'hikey')
	const hasMinimumKey = minimumKey !== undefined
	const hasMaximumKey = maximumKey !== undefined
	const hasKeyRange = hasMinimumKey && hasMaximumKey
	if (hasKeyRange) {
		group.keyRange = [minimumKey as number, maximumKey as number]
	}

	const minimumVelocity = readNumberProperty(properties, 'lovel')
	const maximumVelocity = readNumberProperty(properties, 'hivel')
	const hasMinimumVelocity = minimumVelocity !== undefined
	const hasMaximumVelocity = maximumVelocity !== undefined
	const hasVelocityRange = hasMinimumVelocity && hasMaximumVelocity
	if (hasVelocityRange) {
		group.velRange = [minimumVelocity as number, maximumVelocity as number]
	}

	const groupNumber = readNumberProperty(properties, 'group')
	const hasGroupNumber = groupNumber !== undefined
	if (hasGroupNumber) {
		group.group = groupNumber as number
	}

	const offByGroupNumber = readNumberProperty(properties, 'off_by')
	const hasOffByGroupNumber = offByGroupNumber !== undefined
	if (hasOffByGroupNumber) {
		group.offBy = offByGroupNumber as number
	}

	const sequenceLength = readNumberProperty(properties, 'seq_length')
	const hasSequenceLength = sequenceLength !== undefined
	if (hasSequenceLength) {
		group.seqLength = sequenceLength as number
	}

	const volume = readNumberProperty(properties, 'volume')
	const hasVolume = volume !== undefined
	if (hasVolume) {
		group.volume = volume as number
	}

	const tuneCents = readNumberProperty(properties, 'tune')
	const hasTuneCents = tuneCents !== undefined
	if (hasTuneCents) {
		group.tune = (tuneCents as number) / 100
	}

	const releaseSeconds = readNumberProperty(properties, 'ampeg_release')
	const hasReleaseSeconds = releaseSeconds !== undefined
	if (hasReleaseSeconds) {
		group.ampRelease = releaseSeconds as number
	}

	return group
}

const buildSmplrRegionFromSfzProperties = (
	properties: SfzPropertyMapT,
	defaultPathPrefix: string,
	sfzBaseUrl: string,
	sampleFileUrlBySampleName: Record<string, string>
): import('smplr').SmplrRegion | null => {
	const samplePathValue = readStringProperty(properties, 'sample')
	const hasSamplePathValue = samplePathValue !== undefined
	if (!hasSamplePathValue) return null

	const samplePathWithoutQuotes = trimQuotes(samplePathValue as string)
	const normalizedSamplePath = normalizePathSeparators(samplePathWithoutQuotes)
	let prefixedSamplePath = normalizedSamplePath

	const hasDefaultPathPrefix = defaultPathPrefix.length > 0
	const isSamplePathAbsolute = isAbsoluteHttpUrl(normalizedSamplePath)
	const shouldPrefixPath = hasDefaultPathPrefix && !isSamplePathAbsolute
	if (shouldPrefixPath) {
		prefixedSamplePath = joinSfzPaths(defaultPathPrefix, normalizedSamplePath)
	}

	const samplePathWithExtension = ensureSamplePathHasExtension(prefixedSamplePath)
	const sampleName = stripFileExtension(normalizePathSeparators(samplePathWithExtension))
	const sampleFileUrl = toAbsoluteUrl(sfzBaseUrl, samplePathWithExtension)

	const hasRecordedSampleUrl = sampleFileUrlBySampleName[sampleName] !== undefined
	if (!hasRecordedSampleUrl) {
		sampleFileUrlBySampleName[sampleName] = sampleFileUrl
	}

	const region: import('smplr').SmplrRegion = {
		sample: sampleName
	}

	const exactKey = readMidiProperty(properties, 'key')
	const hasExactKey = exactKey !== undefined
	if (hasExactKey) {
		region.key = exactKey as number
	}

	const hasNoExactKey = !hasExactKey
	if (hasNoExactKey) {
		const minimumKey = readMidiProperty(properties, 'lokey')
		const maximumKey = readMidiProperty(properties, 'hikey')
		const hasMinimumKey = minimumKey !== undefined
		const hasMaximumKey = maximumKey !== undefined
		const hasKeyRange = hasMinimumKey && hasMaximumKey
		if (hasKeyRange) {
			region.keyRange = [minimumKey as number, maximumKey as number]
		}
	}

	const pitchKeyCenter = readMidiProperty(properties, 'pitch_keycenter')
	const hasPitchKeyCenter = pitchKeyCenter !== undefined
	if (hasPitchKeyCenter) {
		region.pitch = pitchKeyCenter as number
	}

	const hasNoPitchKeyCenter = !hasPitchKeyCenter
	if (hasNoPitchKeyCenter) {
		const hasExactKeyForPitch = exactKey !== undefined
		if (hasExactKeyForPitch) {
			region.pitch = exactKey as number
		}

		const hasNoExactKeyForPitch = !hasExactKeyForPitch
		if (hasNoExactKeyForPitch) {
			const hasRegionKeyRange = region.keyRange !== undefined
			if (hasRegionKeyRange) {
				const regionKeyRange = region.keyRange as [number, number]
				region.pitch = regionKeyRange[0]
			}
		}
	}

	const minimumVelocity = readNumberProperty(properties, 'lovel')
	const maximumVelocity = readNumberProperty(properties, 'hivel')
	const hasMinimumVelocity = minimumVelocity !== undefined
	const hasMaximumVelocity = maximumVelocity !== undefined
	const hasVelocityRange = hasMinimumVelocity && hasMaximumVelocity
	if (hasVelocityRange) {
		region.velRange = [minimumVelocity as number, maximumVelocity as number]
	}

	const volume = readNumberProperty(properties, 'volume')
	const hasVolume = volume !== undefined
	if (hasVolume) {
		region.volume = volume as number
	}

	const tuneCents = readNumberProperty(properties, 'tune')
	const hasTuneCents = tuneCents !== undefined
	if (hasTuneCents) {
		region.tune = (tuneCents as number) / 100
	}

	const releaseSeconds = readNumberProperty(properties, 'ampeg_release')
	const hasReleaseSeconds = releaseSeconds !== undefined
	if (hasReleaseSeconds) {
		region.ampRelease = releaseSeconds as number
	}

	const offsetSampleFrames = readNumberProperty(properties, 'offset')
	const hasOffsetSampleFrames = offsetSampleFrames !== undefined
	if (hasOffsetSampleFrames) {
		region.offset = offsetSampleFrames as number
	}

	const loopStart = readNumberProperty(properties, 'loop_start')
	const loopEnd = readNumberProperty(properties, 'loop_end')
	const hasLoopStart = loopStart !== undefined
	const hasLoopEnd = loopEnd !== undefined
	const hasLoopPoints = hasLoopStart && hasLoopEnd
	if (hasLoopPoints) {
		region.loop = true
		region.loopStart = loopStart as number
		region.loopEnd = loopEnd as number
	}

	const sequencePosition = readNumberProperty(properties, 'seq_position')
	const hasSequencePosition = sequencePosition !== undefined
	if (hasSequencePosition) {
		region.seqPosition = sequencePosition as number
	}

	const groupNumber = readNumberProperty(properties, 'group')
	const hasGroupNumber = groupNumber !== undefined
	if (hasGroupNumber) {
		region.group = groupNumber as number
	}

	const offByGroupNumber = readNumberProperty(properties, 'off_by')
	const hasOffByGroupNumber = offByGroupNumber !== undefined
	if (hasOffByGroupNumber) {
		region.offBy = offByGroupNumber as number
	}

	const ampVelocityCurve = readAmpVelocityCurve(properties)
	const hasAmpVelocityCurve = ampVelocityCurve !== undefined
	if (hasAmpVelocityCurve) {
		// smplr 1.x no longer types ampVelCurve; keep it for
		// descriptors that still honor it.
		;(region as Record<string, unknown>).ampVelCurve = ampVelocityCurve
	}

	const reverseValue = readNumberProperty(properties, 'reverse')
	const hasReverseValue = reverseValue !== undefined
	if (hasReverseValue) {
		const shouldReverse = reverseValue === 1
		region.reverse = shouldReverse
	}

	return region
}

const buildJsonDescriptorFromSfz = (options: BuildJsonDescriptorFromSfzOptionsT): SfzConversionResultT => {
	const resolvedDefinesText = resolveSfzDefines(options.sfzText)
	const tokenList = tokenizeSfzText(resolvedDefinesText)
	const sfzBaseUrl = getBaseUrlFromResourceUrl(options.sfzUrl)
	const sampleFileUrlBySampleName: Record<string, string> = {}

	let activeSection: SfzSectionT = SfzSection.global
	let globalPropertyMap: SfzPropertyMapT = {}
	let groupPropertyMap: SfzPropertyMapT = {}
	let pendingPropertyMap: SfzPropertyMapT = {}
	let defaultPathPrefix = ''

	const smplrGroupList: import('smplr').SmplrGroup[] = []
	let currentGroup: import('smplr').SmplrGroup | null = null

	const flushPendingProperties = (): void => {
		const isControlSection = activeSection === SfzSection.control
		if (isControlSection) {
			const controlDefaultPath = readStringProperty(pendingPropertyMap, 'default_path')
			const hasControlDefaultPath = controlDefaultPath !== undefined
			if (hasControlDefaultPath) {
				const normalizedDefaultPath = normalizePathSeparators(controlDefaultPath as string)
				defaultPathPrefix = normalizedDefaultPath
			}
			pendingPropertyMap = {}
			return
		}

		const isGlobalSection = activeSection === SfzSection.global
		if (isGlobalSection) {
			globalPropertyMap = mergePropertyMaps(globalPropertyMap, pendingPropertyMap)
			pendingPropertyMap = {}
			return
		}

		const isGroupSection = activeSection === SfzSection.group
		if (isGroupSection) {
			groupPropertyMap = mergePropertyMaps({}, pendingPropertyMap)
			currentGroup = buildSmplrGroupFromSfzProperties(groupPropertyMap)
			smplrGroupList.push(currentGroup)
			pendingPropertyMap = {}
			return
		}

		const isRegionSection = activeSection === SfzSection.region
		if (isRegionSection) {
			const mergedGlobalAndGroupProperties = mergePropertyMaps(globalPropertyMap, groupPropertyMap)
			const mergedProperties = mergePropertyMaps(mergedGlobalAndGroupProperties, pendingPropertyMap)
			const builtRegion = buildSmplrRegionFromSfzProperties(
				mergedProperties,
				defaultPathPrefix,
				sfzBaseUrl,
				sampleFileUrlBySampleName
			)

			const hasNoGroup = currentGroup === null
			if (hasNoGroup) {
				const emptyGroup = buildSmplrGroupFromSfzProperties({})
				smplrGroupList.push(emptyGroup)
				currentGroup = emptyGroup
			}

			const hasBuiltRegion = builtRegion !== null
			if (hasBuiltRegion) {
				const groupReference = currentGroup as import('smplr').SmplrGroup
				groupReference.regions.push(builtRegion as import('smplr').SmplrRegion)
			}

			pendingPropertyMap = {}
			return
		}

		pendingPropertyMap = {}
	}

	for (let tokenIndex = 0; tokenIndex < tokenList.length; tokenIndex += 1) {
		const token = tokenList[tokenIndex]
		const isHeaderToken = token.tokenType === 'header'
		if (isHeaderToken) {
			flushPendingProperties()
			activeSection = token.sectionName

			const startsNewGroup = activeSection === SfzSection.group
			if (startsNewGroup) {
				groupPropertyMap = {}
				currentGroup = null
			}

			continue
		}

		pendingPropertyMap[token.propertyName] = token.propertyValue
	}

	flushPendingProperties()

	const populatedGroupList: import('smplr').SmplrGroup[] = []
	for (let groupIndex = 0; groupIndex < smplrGroupList.length; groupIndex += 1) {
		const group = smplrGroupList[groupIndex]
		const hasRegions = group.regions.length > 0
		if (hasRegions) {
			populatedGroupList.push(group)
		}
	}

	const jsonDescriptor: SmplrJsonT = {
		samples: {
			baseUrl: '',
			formats: ['wav']
		},
		groups: populatedGroupList
	}

	const conversionResult: SfzConversionResultT = {
		jsonDescriptor: jsonDescriptor,
		sampleFileUrlBySampleName: sampleFileUrlBySampleName
	}

	return conversionResult
}

const isSmplrJsonDescriptor = (value: unknown): value is SmplrJsonT => {
	const isObjectValue = typeof value === 'object'
	if (!isObjectValue) return false

	const isNullValue = value === null
	if (isNullValue) return false

	const objectValue = value as Record<string, unknown>
	const samplesValue = objectValue.samples
	const groupsValue = objectValue.groups
	const hasSamples = samplesValue !== undefined
	if (!hasSamples) return false

	const hasGroups = groupsValue !== undefined
	if (!hasGroups) return false

	const areGroupsAnArray = Array.isArray(groupsValue)
	if (!areGroupsAnArray) return false

	return true
}

const preloadSfzAudioBuffers = async (
	audioContext: BaseAudioContext,
	sampleFileUrlBySampleName: Record<string, string>
): Promise<Map<string, AudioBuffer>> => {
	const preloadedBufferMap = new Map<string, AudioBuffer>()
	const sampleNameList = Object.keys(sampleFileUrlBySampleName)

	for (let sampleIndex = 0; sampleIndex < sampleNameList.length; sampleIndex += 1) {
		const sampleName = sampleNameList[sampleIndex]
		const sampleFileUrl = sampleFileUrlBySampleName[sampleName]

		const sampleFetchResult = await to(fetch(sampleFileUrl))
		const sampleFetchError = sampleFetchResult[0]
		const sampleFetchResponse = sampleFetchResult[1]
		const hasSampleFetchError = sampleFetchError !== null
		if (hasSampleFetchError) {
			return Promise.reject(createError(`Failed to fetch SFZ sample at ${sampleFileUrl}`))
		}

		const hasNoSampleFetchResponse = sampleFetchResponse === undefined
		if (hasNoSampleFetchResponse) {
			return Promise.reject(createError(`No response while fetching SFZ sample at ${sampleFileUrl}`))
		}

		const sampleFetchResponseValue = sampleFetchResponse as Response
		const isResponseOk = sampleFetchResponseValue.ok
		const isResponseNotOk = !isResponseOk
		if (isResponseNotOk) {
			const statusCode = sampleFetchResponseValue.status
			return Promise.reject(createError(`Failed to fetch SFZ sample at ${sampleFileUrl} with status ${statusCode}`))
		}

		const sampleArrayBufferResult = await to(sampleFetchResponseValue.arrayBuffer())
		const sampleArrayBufferError = sampleArrayBufferResult[0]
		const sampleArrayBuffer = sampleArrayBufferResult[1]
		const hasArrayBufferError = sampleArrayBufferError !== null
		if (hasArrayBufferError) {
			return Promise.reject(createError(`Failed to read SFZ sample binary data at ${sampleFileUrl}`))
		}

		const hasNoSampleArrayBuffer = sampleArrayBuffer === undefined
		if (hasNoSampleArrayBuffer) {
			return Promise.reject(createError(`Missing SFZ sample binary data at ${sampleFileUrl}`))
		}

		const copiedSampleArrayBuffer = sampleArrayBuffer.slice(0)
		const decodeResult = await to(audioContext.decodeAudioData(copiedSampleArrayBuffer))
		const decodeError = decodeResult[0]
		const decodedAudioBuffer = decodeResult[1]
		const hasDecodeError = decodeError !== null
		if (hasDecodeError) {
			return Promise.reject(createError(`Failed to decode SFZ sample audio at ${sampleFileUrl}`))
		}

		const hasNoDecodedAudioBuffer = decodedAudioBuffer === undefined
		if (hasNoDecodedAudioBuffer) {
			return Promise.reject(createError(`Decoded SFZ sample was empty at ${sampleFileUrl}`))
		}

		preloadedBufferMap.set(sampleName, decodedAudioBuffer as AudioBuffer)
	}

	return preloadedBufferMap
}

const loadJsonTextIntoPluginSmplr = async (jsonText: string, pluginSmplr: PluginSmplrT): Promise<void> => {
	const parsedJsonResult = await to(
		Promise.resolve().then(() => {
			const parsedValue = JSON.parse(jsonText)
			return parsedValue
		})
	)
	const parsedJsonError = parsedJsonResult[0]
	const parsedJsonValue = parsedJsonResult[1]
	const hasParsedJsonError = parsedJsonError !== null
	if (hasParsedJsonError) {
		return Promise.reject(createError('Failed to parse remote JSON descriptor.'))
	}

	const hasNoParsedJsonValue = parsedJsonValue === undefined
	if (hasNoParsedJsonValue) {
		return Promise.reject(createError('Remote JSON descriptor response was empty.'))
	}

	const parsedDescriptor = parsedJsonValue as unknown
	const isDescriptorValid = isSmplrJsonDescriptor(parsedDescriptor)
	if (!isDescriptorValid) {
		return Promise.reject(createError('Remote JSON descriptor is not a valid smplr JSON shape.'))
	}

	const loadResult = await to(pluginSmplr.loadInstrument(parsedDescriptor as SmplrJsonT))
	const loadError = loadResult[0]
	const hasLoadError = loadError !== null
	if (hasLoadError) {
		return Promise.reject(createError('Failed to load remote JSON descriptor into smplr.'))
	}

	return Promise.resolve()
}

const loadSfzTextIntoPluginSmplr = async (
	audioContext: BaseAudioContext,
	sfzText: string,
	sfzUrl: string,
	pluginSmplr: PluginSmplrT
): Promise<void> => {
	const sfzConversionResult = buildJsonDescriptorFromSfz({
		sfzText: sfzText,
		sfzUrl: sfzUrl
	})

	const preloadedBufferMapResult = await to(
		preloadSfzAudioBuffers(audioContext, sfzConversionResult.sampleFileUrlBySampleName)
	)
	const preloadedBufferMapError = preloadedBufferMapResult[0]
	const preloadedBufferMap = preloadedBufferMapResult[1]
	const hasPreloadError = preloadedBufferMapError !== null
	if (hasPreloadError) {
		return Promise.reject(createError('Failed to preload SFZ sample buffers.'))
	}

	const hasNoPreloadedBufferMap = preloadedBufferMap === undefined
	if (hasNoPreloadedBufferMap) {
		return Promise.reject(createError('SFZ preload did not return any sample buffer map.'))
	}

	const loadResult = await to(
		pluginSmplr.loadInstrument(sfzConversionResult.jsonDescriptor, preloadedBufferMap as Map<string, AudioBuffer>)
	)
	const loadError = loadResult[0]
	const hasLoadError = loadError !== null
	if (hasLoadError) {
		return Promise.reject(createError('Failed to load SFZ descriptor into smplr.'))
	}

	return Promise.resolve()
}

const loadRemoteResourceIntoPluginSmplr = async (
	audioContext: BaseAudioContext,
	resourceUrl: string,
	pluginSmplr: PluginSmplrT
): Promise<void> => {
	const fetchResult = await to(fetch(resourceUrl))
	const fetchError = fetchResult[0]
	const fetchResponse = fetchResult[1]
	const hasFetchError = fetchError !== null
	if (hasFetchError) {
		return Promise.reject(createError(`Failed to fetch instrument resource at ${resourceUrl}`))
	}

	const hasNoFetchResponse = fetchResponse === undefined
	if (hasNoFetchResponse) {
		return Promise.reject(createError(`Missing instrument resource response at ${resourceUrl}`))
	}

	const fetchResponseValue = fetchResponse as Response
	const isResponseOk = fetchResponseValue.ok
	const isResponseNotOk = !isResponseOk
	if (isResponseNotOk) {
		const statusCode = fetchResponseValue.status
		return Promise.reject(createError(`Instrument resource fetch failed at ${resourceUrl} with status ${statusCode}`))
	}

	const responseTextResult = await to(fetchResponseValue.text())
	const responseTextError = responseTextResult[0]
	const responseText = responseTextResult[1]
	const hasResponseTextError = responseTextError !== null
	if (hasResponseTextError) {
		return Promise.reject(createError(`Failed to read instrument resource text at ${resourceUrl}`))
	}

	const hasNoResponseText = responseText === undefined
	if (hasNoResponseText) {
		return Promise.reject(createError(`Instrument resource text was empty at ${resourceUrl}`))
	}

	const detectedFileFormat = detectFileFormat(resourceUrl)
	const isJsonFormat = detectedFileFormat === FileFormat.json
	if (isJsonFormat) {
		const jsonLoadResult = await to(loadJsonTextIntoPluginSmplr(responseText as string, pluginSmplr))
		const jsonLoadError = jsonLoadResult[0]
		const hasJsonLoadError = jsonLoadError !== null
		if (hasJsonLoadError) {
			return Promise.reject(jsonLoadError)
		}

		return Promise.resolve()
	}

	const isSfzFormat = detectedFileFormat === FileFormat.sfz
	if (isSfzFormat) {
		const sfzLoadResult = await to(loadSfzTextIntoPluginSmplr(audioContext, responseText as string, resourceUrl, pluginSmplr))
		const sfzLoadError = sfzLoadResult[0]
		const hasSfzLoadError = sfzLoadError !== null
		if (hasSfzLoadError) {
			return Promise.reject(sfzLoadError)
		}

		return Promise.resolve()
	}

	const jsonAttemptResult = await to(loadJsonTextIntoPluginSmplr(responseText as string, pluginSmplr))
	const jsonAttemptError = jsonAttemptResult[0]
	const hasJsonAttemptError = jsonAttemptError !== null
	if (!hasJsonAttemptError) {
		return Promise.resolve()
	}

	const sfzAttemptResult = await to(
		loadSfzTextIntoPluginSmplr(audioContext, responseText as string, resourceUrl, pluginSmplr)
	)
	const sfzAttemptError = sfzAttemptResult[0]
	const hasSfzAttemptError = sfzAttemptError !== null
	if (hasSfzAttemptError) {
		return Promise.reject(createError(`Unable to parse remote resource at ${resourceUrl} as JSON or SFZ descriptor format.`))
	}

	return Promise.resolve()
}

const collectStopNoteNames = (noteArguments: StopArgumentT[]): string[] => {
	const collectedNoteNames: string[] = []

	for (let argumentIndex = 0; argumentIndex < noteArguments.length; argumentIndex += 1) {
		const argumentValue = noteArguments[argumentIndex]
		const isArrayArgument = Array.isArray(argumentValue)
		if (isArrayArgument) {
			const noteNameList = argumentValue as string[]
			for (let noteIndex = 0; noteIndex < noteNameList.length; noteIndex += 1) {
				const noteName = noteNameList[noteIndex]
				collectedNoteNames.push(noteName)
			}
		}

		const isStringArgument = typeof argumentValue === 'string'
		if (isStringArgument) {
			collectedNoteNames.push(argumentValue as string)
		}
	}

	return collectedNoteNames
}

const buildManagedInstrument = (options: BuildManagedInstrumentOptionsT): ManagedInstrumentT => {
	const playingNotesStore = datass.object<PlayingNotesStateT>({})

	const removeNoteState = (noteName: string): void => {
		playingNotesStore.set.by((playingNotesDraft: PlayingNotesStateT) => {
			delete playingNotesDraft[noteName]
		})
	}

	const setNoteState = (noteState: PlayingNoteStateT): void => {
		playingNotesStore.set.by((playingNotesDraft: PlayingNotesStateT) => {
			playingNotesDraft[noteState.noteName] = noteState
		})
	}

	const stopSingleNote = (noteName: string): void => {
		const noteState = playingNotesStore.state[noteName]
		const hasNoNoteState = noteState === undefined
		if (hasNoNoteState) return

		const timeoutIdentifier = noteState.timeoutIdentifier
		const hasTimeoutIdentifier = timeoutIdentifier !== null
		if (hasTimeoutIdentifier) {
			clearTimeout(timeoutIdentifier as ReturnType<typeof setTimeout>)
		}

		const stopPlayback = noteState.stopPlayback
		const hasStopPlayback = stopPlayback !== null
		if (hasStopPlayback) {
			const stopPlaybackFunction = stopPlayback as (time?: number) => void
			stopPlaybackFunction()
		}

		removeNoteState(noteName)
	}

	const stopNotes = (...noteArguments: StopArgumentT[]): void => {
		const hasNoStopArguments = noteArguments.length === 0
		if (hasNoStopArguments) {
			const playingNoteNameList = Object.keys(playingNotesStore.state)
			for (let playingNoteIndex = 0; playingNoteIndex < playingNoteNameList.length; playingNoteIndex += 1) {
				const playingNoteName = playingNoteNameList[playingNoteIndex]
				stopSingleNote(playingNoteName)
			}

			return
		}

		const noteNameList = collectStopNoteNames(noteArguments)
		for (let noteIndex = 0; noteIndex < noteNameList.length; noteIndex += 1) {
			const noteName = noteNameList[noteIndex]
			stopSingleNote(noteName)
		}
	}

	const play = (playOptions: PlayOptionsT): void => {
		console.log(`Playing notes ${playOptions.notes.join(', ')} on instrument "${options.name}" with options:`, playOptions)
		const shouldResumeAudioContext = sharedAudioContext.state === 'suspended'
		if (shouldResumeAudioContext) {
			console.log('Resuming shared audio context before playback.')
			const audioContextResumePromise = sharedAudioContext.resume()
			void audioContextResumePromise
		}

		const noteCount = playOptions.notes.length
		const hasNoNotes = noteCount === 0
		if (hasNoNotes) console.log('No notes to play, exiting play function early.')
		if (hasNoNotes) return

		const noteDurationMilliseconds = resolveDurationMilliseconds(playOptions)
		console.log(`Resolved note duration for "${options.name}" to ${noteDurationMilliseconds} milliseconds.`)
		for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) {
			const noteName = playOptions.notes[noteIndex]
			stopSingleNote(noteName)

			const velocityMidi = resolveVelocityForNote(playOptions)
			const delayMilliseconds = resolveDelayForNoteMilliseconds(playOptions)
			const delaySeconds = delayMilliseconds / MILLISECONDS_PER_SECOND
			const startTimeSeconds = sharedAudioContext.currentTime + delaySeconds

			console.log(
				`Starting playback of note "${noteName}" on instrument "${options.name}" at audio context time ${startTimeSeconds} seconds with velocity ${velocityMidi} (delay of ${delayMilliseconds} ms).`
			)
			const stopPlayback = options.smplrInstrument.start({
				note: noteName,
				time: startTimeSeconds,
				velocity: velocityMidi
			})

			const timeoutDurationMilliseconds = noteDurationMilliseconds + delayMilliseconds

			const timeoutIdentifier = setTimeout(() => {
				stopSingleNote(noteName)
			}, timeoutDurationMilliseconds)

			const noteState: PlayingNoteStateT = {
				noteName: noteName,
				startedAtSeconds: startTimeSeconds,
				velocityMidi: velocityMidi,
				delayMilliseconds: delayMilliseconds,
				timeoutIdentifier: timeoutIdentifier,
				stopPlayback: stopPlayback
			}

			setNoteState(noteState)
		}
	}

	const getPlayingNotes = (): string[] => {
		const playingNoteNameList = Object.keys(playingNotesStore.state)
		return playingNoteNameList
	}

	const managedInstrument: ManagedInstrumentT = {
		name: options.name,
		description: options.description ?? '',
		ready: options.smplrInstrument.ready,
		play: play,
		stop: stopNotes,
		getPlayingNotes: getPlayingNotes
	}

	return managedInstrument
}

const RemoteJsonOrSfzInstrument = Instrument<RemoteInstrumentLoaderOptionsT>((audioContext, options, pluginSmplr) => {
	const pluginSmplrValue = pluginSmplr as unknown as PluginSmplrT
	const loadPromise = loadRemoteResourceIntoPluginSmplr(audioContext, options.resourceUrl, pluginSmplrValue)
	return loadPromise
})

type Soundfont2SamplerInstrumentT = import('smplr').Smplr & {
	instrumentNames: string[]
	loadInstrument: (instrumentName: string) => Promise<void> | undefined
}

const createSoundfont2ManagedInstrument = async (options: CreateInstrumentOptionsT): Promise<ManagedInstrumentT> => {
	const soundfont2Sampler = Soundfont2Sampler(sharedAudioContext, {
		url: options.url,
		createSoundfont: (data: Uint8Array) => {
			return new SoundFont2(data)
		}
	}) as Soundfont2SamplerInstrumentT

	const samplerReadyResult = await to(soundfont2Sampler.ready)
	const samplerReadyError = samplerReadyResult[0]
	const hasSamplerReadyError = samplerReadyError !== null
	if (hasSamplerReadyError) {
		return Promise.reject(createError(`Failed to parse SF2 file for instrument "${options.name}" from ${options.url}`))
	}

	const instrumentNameList = soundfont2Sampler.instrumentNames
	const hasNoInstrumentNames = instrumentNameList.length === 0
	if (hasNoInstrumentNames) {
		return Promise.reject(createError(`No instruments were found in SF2 file at ${options.url}`))
	}

	const selectedInstrumentName = instrumentNameList[0]
	console.log(`Loading SF2 instrument "${selectedInstrumentName}" from ${options.url}`)

	const loadInstrumentPromise = soundfont2Sampler.loadInstrument(selectedInstrumentName)
	const hasNoLoadInstrumentPromise = loadInstrumentPromise === undefined
	if (hasNoLoadInstrumentPromise) {
		return Promise.reject(createError(`Failed to select SF2 instrument "${selectedInstrumentName}" from ${options.url}`))
	}

	const loadInstrumentResult = await to(loadInstrumentPromise as Promise<void>)
	const loadInstrumentError = loadInstrumentResult[0]
	const hasLoadInstrumentError = loadInstrumentError !== null
	if (hasLoadInstrumentError) {
		return Promise.reject(createError(`Failed to load SF2 instrument "${selectedInstrumentName}" from ${options.url}`))
	}

	const managedInstrument = buildManagedInstrument({
		name: options.name,
		description: options.description,
		smplrInstrument: soundfont2Sampler
	})

	createdInstrumentsStore.set.append(managedInstrument)
	console.log(
		`Successfully created instrument "${options.name}" from ${options.url} using SF2 instrument "${selectedInstrumentName}"`
	)

	return managedInstrument
}

const createInstrument = async (options: CreateInstrumentOptionsT): Promise<ManagedInstrumentT> => {
	console.log('Creating instrument with options:', options)
	const detectedFileFormat = detectFileFormat(options.url)
	const isSf2InstrumentUrl = detectedFileFormat === FileFormat.sf2
	if (isSf2InstrumentUrl) {
		const managedSoundfont2Instrument = await createSoundfont2ManagedInstrument(options)
		return managedSoundfont2Instrument
	}

	const remoteInstrument = RemoteJsonOrSfzInstrument(sharedAudioContext, {
		resourceUrl: options.url
	})

	const managedInstrument = buildManagedInstrument({
		name: options.name,
		description: options.description,
		smplrInstrument: remoteInstrument
	})

	const readinessResult = await to(managedInstrument.ready)
	const readinessError = readinessResult[0]
	const hasReadinessError = readinessError !== null

	if (hasReadinessError) {
		return Promise.reject(createError(`Failed to create instrument "${options.name}" from ${options.url}`))
	}

	createdInstrumentsStore.set.append(managedInstrument)
	console.log(`Successfully created instrument "${options.name}" from ${options.url}`)
	return managedInstrument
}

const stockSplendidGrandPiano = buildManagedInstrument({
	name: 'Splendid Grand Piano',
	description: 'Stock smplr acoustic piano.',
	smplrInstrument: SplendidGrandPiano(sharedAudioContext)
})

const stockSoundfontPiano = buildManagedInstrument({
	name: 'Soundfont Piano',
	description: 'Stock smplr General MIDI acoustic grand piano.',
	smplrInstrument: Soundfont(sharedAudioContext, {
		instrument: 'acoustic_grand_piano'
	})
})

const stockDrumMachine = buildManagedInstrument({
	name: 'Drum Machine 808',
	description: 'Stock smplr TR-808 drum machine.',
	smplrInstrument: DrumMachine(sharedAudioContext, {
		instrument: 'TR-808'
	})
})

export const instruments = {
	create: createInstrument,
	created: createdInstrumentsStore,
	stock: {
		splendidGrandPiano: stockSplendidGrandPiano,
		soundfontPiano: stockSoundfontPiano,
		drumMachine808: stockDrumMachine
	}
}

export type { CreateInstrumentOptionsT, ManagedInstrumentT, StopArgumentT }
