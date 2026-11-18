import { getModule } from '@valenced/modules/finders'
import { byProps } from '@valenced/modules/finders/filters'
import { patchMessageActionSheet } from './actionsheet'
import { registerTranslateCommand } from './command'
import { getSettings, loadSettings, saveSettings } from './storage'
import { clearTranslationCache, translate } from './translator'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const messageCache = new Map<string, string>()
const cleanups: Array<() => void> = []

// ---------------------------------------------------------------------------
// Markdown, URL, and Discord Tag Protection
// ---------------------------------------------------------------------------
export function maskContent(text: string) {
	const placeholders: string[] = []
	function addPlaceholder(match: string) {
		placeholders.push(match)
		return `__DISLATE_${placeholders.length - 1}__`
	}

	// 1. Code blocks: ```...``` (do not translate code)
	let masked = text.replace(/```[\s\S]*?```/g, addPlaceholder)

	// 2. Inline code: `...`
	masked = masked.replace(/`[^`]+`/g, addPlaceholder)

	// 3. Markdown link targets: [Text](URL) -> [Text](__DISLATE_X__)
	masked = masked.replace(/(\]\()(https?:\/\/[^\s\)]+)(\))/g, (_, p1, url, p3) => {
		placeholders.push(url)
		return `${p1}__DISLATE_${placeholders.length - 1}__${p3}`
	})

	// 4. Standalone URLs: <https://...> or https://...
	masked = masked.replace(/<?https?:\/\/[^\s>]+>?/g, addPlaceholder)

	// 5. Discord tags: emojis, mentions, roles, channels, slash commands, timestamps
	masked = masked.replace(
		/<a?:\w+:\d+>|<@!?\d+>|<@&\d+>|<#\d+>|<\/\w+(?:\s+\w+)?:[0-9]+>|<t:\d+(?::[tTdDfFR])?>/g,
		addPlaceholder,
	)

	// 6. Discord emoji shortcodes :name: (e.g. :emojis:, :smile:, :tada:)
	masked = masked.replace(/:[a-zA-Z0-9_+-]+:/g, addPlaceholder)

	return { masked, placeholders }
}

export function unmaskContent(text: string, placeholders: string[]) {
	let unmasked = text
	for (let i = 0; i < placeholders.length; i++) {
		const regex = new RegExp(`__\\s*DISLATE_${i}\\s*__`, 'gi')
		unmasked = unmasked.replace(regex, placeholders[i])
	}
	// Clean up any accidental spaces inserted around markdown link brackets: "] (" -> "]("
	unmasked = unmasked.replace(/\]\s+\(/g, '](')
	return unmasked
}

// ---------------------------------------------------------------------------
// Flux dispatcher – resolved lazily via metro
// ---------------------------------------------------------------------------
function getFluxDispatcher(): { dispatch(action: any): void } | null {
	try {
		const mod = getModule(byProps('dispatch', 'subscribe'))
		return mod as { dispatch(action: any): void } | null
	} catch {
		return null
	}
}

// ---------------------------------------------------------------------------
// Translation logic
// ---------------------------------------------------------------------------
async function handleTranslate(message: any) {
	const settings = getSettings()
	const messageId = message?.id
	const channelId = message?.channel_id
	const originalContent = message?.content

	if (!messageId || !originalContent) return

	messageCache.set(messageId, originalContent)

	const { masked, placeholders } = maskContent(originalContent)

	try {
		const res = await translate(masked, {
			engine: settings.engine,
			sourceLang: settings.sourceLanguage,
			targetLang: settings.targetLanguage,
		})

		const translatedText = unmaskContent(res.translatedText, placeholders)

		const finalContent = settings.immersive
			? `${originalContent}\n${translatedText.trim()} \`[${settings.targetLanguage}]\``
			: `${translatedText.trim()} \`[${settings.targetLanguage}]\``

		getFluxDispatcher()?.dispatch({
			type: 'MESSAGE_UPDATE',
			message: {
				id: messageId,
				channel_id: channelId,
				content: finalContent,
			},
			log_edit: false,
		})
	} catch (err) {
		console.error('[Dislate] Translation failed:', err)
	}
}

function handleRevert(message: any) {
	const messageId = message?.id
	const channelId = message?.channel_id
	const originalContent = messageCache.get(messageId)

	if (!messageId || !originalContent) return
	messageCache.delete(messageId)

	getFluxDispatcher()?.dispatch({
		type: 'MESSAGE_UPDATE',
		message: {
			id: messageId,
			channel_id: channelId,
			content: originalContent,
		},
		log_edit: false,
	})
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------
export default plugin({
	async start(api) {
		await loadSettings()
		console.log('[Dislate] Dislate EX initialized')

		const unpatch = patchMessageActionSheet(
			handleTranslate,
			handleRevert,
			(id: string) => messageCache.has(id),
		)
		cleanups.push(unpatch)

		const unregisterCmd = registerTranslateCommand(api)
		cleanups.push(unregisterCmd)

		const g = globalThis as any
		g.Dislate = {
			translate,
			handleTranslate,
			handleRevert,
			getSettings,
			saveSettings,
			messageCache,
		}
	},

	stop() {
		console.log('[Dislate] Dislate EX stopped')

		for (const fn of cleanups) {
			try {
				fn()
			} catch {}
		}
		cleanups.length = 0

		const g = globalThis as any
		if (g.Dislate) delete g.Dislate

		messageCache.clear()
		clearTranslationCache()
	},
})
