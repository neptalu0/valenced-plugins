import { getModule } from '@valenced/modules/finders'
import { byProps } from '@valenced/modules/finders/filters'

export interface DislateSettings {
	targetLanguage: string
	sourceLanguage: string
	engine: 'google' | 'lingva' | 'ai'
	showOriginal: boolean
	immersive: boolean
	translateOutgoing: boolean
	aiEndpoint: string
	aiApiKey: string
	aiModel: string
	cachedModels?: string[]
}

export const DEFAULT_SETTINGS: DislateSettings = {
	targetLanguage: 'en',
	sourceLanguage: 'auto',
	engine: 'google',
	showOriginal: true,
	immersive: false,
	translateOutgoing: false,
	aiEndpoint: '',
	aiApiKey: '',
	aiModel: '',
	cachedModels: [],
}

const STORAGE_KEY = 'dislate_settings'

let currentSettings: DislateSettings = { ...DEFAULT_SETTINGS }

let AsyncStorage: {
	getItem(key: string): Promise<string | null>
	setItem(key: string, value: string): Promise<void>
} | null = null

function resolveAsyncStorage() {
	if (AsyncStorage) return
	try {
		const mod = getModule(byProps('getItem', 'setItem', 'removeItem'))
		if (mod) AsyncStorage = mod as typeof AsyncStorage
	} catch {}
}

export async function loadSettings(): Promise<DislateSettings> {
	resolveAsyncStorage()
	try {
		const raw = await AsyncStorage?.getItem(STORAGE_KEY)
		if (raw) {
			currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
		}
	} catch (e) {
		console.warn('[Dislate] Failed to read settings from storage', e)
	}
	return currentSettings
}

export async function saveSettings(
	patch: Partial<DislateSettings>,
): Promise<DislateSettings> {
	currentSettings = { ...currentSettings, ...patch }
	try {
		resolveAsyncStorage()
		await AsyncStorage?.setItem(STORAGE_KEY, JSON.stringify(currentSettings))
	} catch (e) {
		console.warn('[Dislate] Failed to persist settings', e)
	}
	return currentSettings
}

export function getSettings(): DislateSettings {
	return currentSettings
}
