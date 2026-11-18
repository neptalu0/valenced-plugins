import { LANGUAGES } from './languages'
import { getSettings } from './storage'

export interface TranslationOptions {
	engine?: 'google' | 'lingva' | 'ai'
	targetLang?: string
	sourceLang?: string
}

export interface TranslationResult {
	translatedText: string
	detectedSourceLang?: string
	sourceLang: string
	targetLang: string
	engine: string
}

// In-memory cache: `${engine}:${sourceLang}:${targetLang}:${text}`
const translationCache = new Map<string, TranslationResult>()

/**
 * Translates text using Google's free translation endpoint.
 */
export async function translateGoogle(
	text: string,
	targetLang: string = 'en',
	sourceLang: string = 'auto',
): Promise<TranslationResult> {
	const trimmed = text.trim()
	if (!trimmed) {
		return { translatedText: text, sourceLang, targetLang, engine: 'google' }
	}

	const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
		sourceLang,
	)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmed)}`

	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Google Translate error: HTTP ${response.status}`)
	}

	const data = await response.json()
	const translatedText = Array.isArray(data?.[0])
		? data[0].map((item: any) => item?.[0] ?? '').join('')
		: trimmed
	const detectedSourceLang = data?.[2] || sourceLang

	return {
		translatedText,
		detectedSourceLang,
		sourceLang,
		targetLang,
		engine: 'google',
	}
}

/**
 * Translates text using the open-source Lingva public API endpoint.
 */
export async function translateLingva(
	text: string,
	targetLang: string = 'en',
	sourceLang: string = 'auto',
): Promise<TranslationResult> {
	const trimmed = text.trim()
	if (!trimmed) {
		return { translatedText: text, sourceLang, targetLang, engine: 'lingva' }
	}

	const src = sourceLang === 'auto' ? 'auto' : sourceLang
	const url = `https://lingva.ml/api/v1/${encodeURIComponent(src)}/${encodeURIComponent(
		targetLang,
	)}/${encodeURIComponent(trimmed)}`

	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Lingva Translate error: HTTP ${response.status}`)
	}

	const data = await response.json()
	const translatedText = data?.translation || trimmed
	const detectedSourceLang = data?.info?.detectedSource || sourceLang

	return {
		translatedText,
		detectedSourceLang,
		sourceLang,
		targetLang,
		engine: 'lingva',
	}
}

/**
 * Translates text using an OpenAI-compatible chat completions endpoint.
 */
export async function translateAI(
	text: string,
	targetLang: string = 'en',
	sourceLang: string = 'auto',
): Promise<TranslationResult> {
	const trimmed = text.trim()
	if (!trimmed) {
		return { translatedText: text, sourceLang, targetLang, engine: 'ai' }
	}

	const settings = getSettings()
	const endpoint = (settings.aiEndpoint || '').trim().replace(/\/+$/, '')
	const apiKey = (settings.aiApiKey || '').trim()
	const model = (settings.aiModel || '').trim() || 'gpt-4o-mini'

	if (!endpoint || !apiKey) {
		throw new Error('AI translation requires API Endpoint and API Key to be configured in plugin settings.')
	}

	const url = `${endpoint}/chat/completions`
	const targetName = LANGUAGES[targetLang] || targetLang

	const systemPrompt = `You are a professional Discord translator. Translate the text into ${targetName}.
CRITICAL FORMATTING RULES:
1. Preserve ALL Discord Markdown syntax exactly:
   - Bold: **text**
   - Italics: *text* or _text_
   - Underline: __text__
   - Strikethrough: ~~text~~
   - Spoilers: ||text||
   - Blockquotes: lines starting with > or >>>
   - Subtext: lines starting with -#
   - Headers: lines starting with #, ##, ###
   - Lists: bullet points (-, *, •) and numbered lists (1., 2.)
   - Inline code: \`code\`
2. NEVER convert plain text or URLs into markdown links [text](url).
3. Output ONLY the translated text, without commentary, notes, or surrounding quotes.
4. Keep all placeholders like __DISLATE_0__, __DISLATE_1__, etc. completely untouched.`

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [
				{
					role: 'system',
					content: systemPrompt,
				},
				{
					role: 'user',
					content: trimmed,
				},
			],
			temperature: 0.1,
		}),
	})

	if (!response.ok) {
		const errBody = await response.text().catch(() => '')
		throw new Error(`AI Translation error: HTTP ${response.status} - ${errBody}`)
	}

	const data = await response.json()
	let translatedText = data?.choices?.[0]?.message?.content?.trim() || trimmed

	// Strip surrounding double quotes if added by model
	if (translatedText.startsWith('"') && translatedText.endsWith('"')) {
		translatedText = translatedText.slice(1, -1).trim()
	}

	// Strip wrapping markdown code blocks if erroneously added
	if (translatedText.startsWith('```') && translatedText.endsWith('```')) {
		const lines = translatedText.split('\n')
		if (lines.length > 2) {
			translatedText = lines.slice(1, -1).join('\n').trim()
		}
	}

	return {
		translatedText,
		detectedSourceLang: sourceLang,
		sourceLang,
		targetLang,
		engine: 'ai',
	}
}

/**
 * Unified translation dispatch with in-memory caching and engine fallbacks.
 */
export async function translate(
	text: string,
	options: TranslationOptions = {},
): Promise<TranslationResult> {
	const engine = options.engine || getSettings().engine || 'google'
	const targetLang = options.targetLang || getSettings().targetLanguage || 'en'
	const sourceLang = options.sourceLang || getSettings().sourceLanguage || 'auto'

	const cacheKey = `${engine}:${sourceLang}:${targetLang}:${text}`
	if (translationCache.has(cacheKey)) {
		return translationCache.get(cacheKey)!
	}

	let result: TranslationResult

	try {
		if (engine === 'ai') {
			result = await translateAI(text, targetLang, sourceLang)
		} else if (engine === 'lingva') {
			result = await translateLingva(text, targetLang, sourceLang)
		} else {
			result = await translateGoogle(text, targetLang, sourceLang)
		}
	} catch (primaryError) {
		console.warn(
			`[Dislate] Primary engine (${engine}) failed, trying fallback:`,
			primaryError,
		)
		if (engine === 'ai' || engine === 'lingva') {
			result = await translateGoogle(text, targetLang, sourceLang)
		} else {
			result = await translateLingva(text, targetLang, sourceLang)
		}
	}

	translationCache.set(cacheKey, result)
	return result
}

export function clearTranslationCache(): void {
	translationCache.clear()
}
