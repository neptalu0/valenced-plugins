import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { maskContent, unmaskContent } from './index'
import { LANGUAGES } from './languages'
import { getSettings } from './storage'
import { translate } from './translator'

export enum ApplicationCommandType {
	CHAT = 1,
	USER = 2,
	MESSAGE = 3,
}

export enum ApplicationCommandInputType {
	BUILT_IN = 0,
	BUILT_IN_TEXT = 1,
	BUILT_IN_INTEGRATION = 2,
	BOT = 3,
	PLACEHOLDER = 4,
}

export enum ApplicationCommandOptionType {
	SUB_COMMAND = 1,
	SUB_COMMAND_GROUP = 2,
	STRING = 3,
	INTEGER = 4,
	BOOLEAN = 5,
	USER = 6,
	CHANNEL = 7,
	ROLE = 8,
	MENTIONABLE = 9,
	NUMBER = 10,
	ATTACHMENT = 11,
}

export interface ApplicationCommandOptionChoice {
	name: string
	value: string
	displayName?: string
}

export interface ApplicationCommandOption {
	name: string
	description: string
	required?: boolean
	type: ApplicationCommandOptionType
	displayName?: string
	displayDescription?: string
	choices?: ApplicationCommandOptionChoice[]
}

export interface ApplicationCommand {
	name: string
	description: string
	execute: (...args: any[]) => Promise<any> | any
	options?: ApplicationCommandOption[]
	id?: string
	applicationId?: string
	displayName?: string
	displayDescription?: string
	untranslatedDescription?: string
	untranslatedName?: string
	inputType?: ApplicationCommandInputType
	type?: ApplicationCommandType
	shouldHide?: () => boolean
}

let chatInputs: any = null
let messageActions: any = null
let selectedChannelStore: any = null
const registeredCommands: ApplicationCommand[] = []
const commandCleanups: Array<() => void> = []

export function resolveLanguageCode(input: string): string {
	const raw = (input || '').trim().toLowerCase()
	if (LANGUAGES[raw]) return raw

	const byName = Object.entries(LANGUAGES).find(
		([, name]) => name.toLowerCase() === raw,
	)
	if (byName) return byName[0]

	const partial = Object.entries(LANGUAGES).find(([, name]) =>
		name.toLowerCase().startsWith(raw),
	)
	if (partial) return partial[0]

	return raw
}

function getAlert(): any {
	const g = globalThis as any
	return (
		g.valenced?.react?.ReactNative?.Alert ||
		g.ReactNative?.Alert ||
		null
	)
}

function getClipboard(): any {
	const g = globalThis as any
	return (
		g.valenced?.externals?.ReactNativeClipboard?.Clipboard ||
		g.valenced?.react?.ReactNative?.Clipboard ||
		g.ReactNative?.Clipboard ||
		null
	)
}

function showToast(text: string) {
	try {
		const g = globalThis as any
		const ToastActionCreators = g.valenced?.discord?.actions?.ToastActionCreators
		if (ToastActionCreators?.open) {
			ToastActionCreators.open('DISLATE_TOAST', { text, variant: 'default' })
		}
	} catch {}
}

function findModuleByProps(...props: string[]) {
	try {
		const g = globalThis as any
		const finders =
			g.valenced?.modules?.finders ||
			g.window?.valenced?.modules?.finders
		const filters = finders?.filters
		const filterFn = filters?.byProps || filters?.withProps
		if (finders && filterFn) {
			if (typeof finders.getModule === 'function') {
				const mod = finders.getModule(filterFn(...props))
				if (mod) return mod
			}
			if (typeof finders.lookupModule === 'function') {
				const list = finders.lookupModule(filterFn(...props))
				if (list && list.length > 0) return list[0]
			}
		}
	} catch (e) {
		console.warn('[Dislate] findModuleByProps error:', e)
	}
	return null
}

function getSelectedChannelId(): string {
	if (selectedChannelStore?.getChannelId) {
		try {
			const id = selectedChannelStore.getChannelId()
			if (id) return id
		} catch {}
	}
	const store =
		findModuleByProps('getChannelId', 'getVoiceChannelId') ||
		findModuleByProps('getChannelId')
	if (store?.getChannelId) {
		selectedChannelStore = store
		try {
			const id = store.getChannelId()
			if (id) return id
		} catch {}
	}
	return ''
}

function resolveChatInputs() {
	if (chatInputs?.getBestActiveInputForChannelId) return chatInputs
	const mod = findModuleByProps('getBestActiveInputForChannelId')
	if (mod?.getBestActiveInputForChannelId) {
		chatInputs = mod
		return mod
	}
	return null
}

function resolveMessageActions() {
	if (messageActions?.sendMessage) return messageActions
	const g = globalThis as any
	const explicit =
		g.valenced?.discord?.actions?.MessageActions ||
		g.window?.valenced?.discord?.actions?.MessageActions
	if (explicit?.sendMessage) {
		messageActions = explicit
		return explicit
	}
	const candidates = [
		findModuleByProps('sendMessage', 'receiveMessage'),
		findModuleByProps('sendMessage', 'editMessage'),
		findModuleByProps('sendMessage', 'deleteMessage'),
		findModuleByProps('sendMessage', 'sendBotMessage'),
		findModuleByProps('sendMessage'),
	]
	for (const cand of candidates) {
		if (!cand) continue
		if (typeof cand.sendMessage === 'function') {
			messageActions = cand
			return cand
		}
		if (cand.default && typeof cand.default.sendMessage === 'function') {
			messageActions = cand.default
			return cand.default
		}
	}
	return null
}

function insertIntoChatbox(channelId: string, text: string): boolean {
	try {
		const resolvedInputs = resolveChatInputs()
		const targetChannelId = channelId || getSelectedChannelId()
		const input = resolvedInputs?.getBestActiveInputForChannelId?.(targetChannelId)
		if (input) {
			if (typeof input.insertText === 'function') {
				input.insertText(text)
				return true
			}
			if (typeof input.setText === 'function') {
				input.setText(text)
				return true
			}
		}
	} catch (e) {
		console.warn('[Dislate] insertIntoChatbox error:', e)
	}
	return false
}

function sendChatMessage(channelId: string, text: string) {
	const targetChannelId = channelId || getSelectedChannelId()
	const actions = resolveMessageActions()

	if (actions?.sendMessage && targetChannelId) {
		try {
			const res = actions.sendMessage(targetChannelId, { content: text })
			if (res && typeof res.catch === 'function') {
				res.catch((err: any) => {
					console.error('[Dislate] sendMessage promise rejected:', err)
					insertIntoChatbox(targetChannelId, text)
					const Alert = getAlert()
					if (Alert?.alert) {
						Alert.alert(
							'Dislate Error',
							`Failed to send directly: ${err?.message || err}. Translation placed in chatbar.`,
						)
					} else {
						showToast('Failed to send; placed in chatbar.')
					}
				})
			}
			return true
		} catch (e) {
			console.error('[Dislate] sendChatMessage error:', e)
		}
	}

	const inserted = insertIntoChatbox(targetChannelId, text)
	const Alert = getAlert()
	if (Alert?.alert) {
		Alert.alert(
			'Dislate Notice',
			`Direct send is unavailable in this channel. ${inserted ? 'The translation has been placed in your chat input bar for you to send.' : 'Could not insert into chat input bar.'}`,
		)
	} else {
		showToast('Direct send unavailable; placed in chatbar.')
	}
	return false
}

function extractArg(args: any, name: string, index: number): string {
	if (!args) return ''
	if (Array.isArray(args)) {
		const item = args.find(
			(a: any) =>
				a &&
				(a.name === name ||
					a.displayName === name ||
					(typeof a.name === 'string' &&
						a.name.toLowerCase() === name.toLowerCase())),
		)
		if (item !== undefined) {
			return (item.value ?? item.content ?? item.text ?? '').toString()
		}
		const pos = args[index]
		if (pos !== undefined) {
			if (typeof pos === 'object' && pos !== null) {
				return (pos.value ?? pos.content ?? pos.text ?? '').toString()
			}
			return pos.toString()
		}
	}
	if (typeof args === 'object' && args !== null) {
		if (args[name] !== undefined) {
			const v = args[name]
			if (typeof v === 'object' && v !== null) {
				return (v.value ?? v.content ?? v.text ?? '').toString()
			}
			return v.toString()
		}
		if (Array.isArray(args.options)) {
			return extractArg(args.options, name, index)
		}
	}
	return ''
}

function showTranslateAlert(
	targetLang: string,
	translatedText: string,
	channelId: string,
) {
	const Alert = getAlert()
	const langName = LANGUAGES[targetLang] || targetLang.toUpperCase()
	const title = `Dislate (${langName})`

	if (Alert?.alert) {
		Alert.alert(
			title,
			translatedText,
			[
				{
					text: 'Cancel',
					style: 'cancel',
				},
				{
					text: 'Use Result',
					onPress: () => {
						const targetChannelId = channelId || getSelectedChannelId()
						const inserted = insertIntoChatbox(targetChannelId, translatedText)
						if (!inserted) {
							const clip = getClipboard()
							clip?.setString?.(translatedText)
							showToast('Copied translation to clipboard')
						}
					},
				},
			],
			{ cancelable: true },
		)
	} else {
		// Fallback: insert directly into message box
		const targetChannelId = channelId || getSelectedChannelId()
		insertIntoChatbox(targetChannelId, translatedText)
	}
}

function initModules() {
	if (!chatInputs) {
		const unsub1 = getModules(withProps('getBestActiveInputForChannelId'), (mod) => {
			if (mod?.getBestActiveInputForChannelId) chatInputs = mod
		})
		commandCleanups.push(unsub1)
	}
	if (!selectedChannelStore) {
		const unsub4 = getModules(withProps('getChannelId', 'getVoiceChannelId'), (mod) => {
			if (mod?.getChannelId) selectedChannelStore = mod
		})
		commandCleanups.push(unsub4)
	}
}

export function registerTranslateCommand(api?: any): () => void {
	initModules()

	const translateCmd: ApplicationCommand = {
		name: 'translate',
		displayName: 'translate',
		description: 'Translate text to a target language',
		displayDescription: 'Translate text to a target language',
		applicationId: '-1',
		type: ApplicationCommandType.CHAT,
		inputType: ApplicationCommandInputType.BUILT_IN,
		shouldHide: () => false,
		options: [
			{
				name: 'toLang',
				displayName: 'toLang',
				description: 'Target language to translate into',
				displayDescription: 'Target language to translate into',
				type: ApplicationCommandOptionType.STRING,
				required: true,
				choices: [
					{ name: 'English', displayName: 'English', value: 'en' },
					{ name: 'Chinese (Simplified)', displayName: 'Chinese (Simplified)', value: 'zh' },
					{ name: 'Chinese (Traditional)', displayName: 'Chinese (Traditional)', value: 'zh-TW' },
					{ name: 'Spanish', displayName: 'Spanish', value: 'es' },
					{ name: 'Japanese', displayName: 'Japanese', value: 'ja' },
					{ name: 'Korean', displayName: 'Korean', value: 'ko' },
					{ name: 'French', displayName: 'French', value: 'fr' },
					{ name: 'German', displayName: 'German', value: 'de' },
					{ name: 'Russian', displayName: 'Russian', value: 'ru' },
					{ name: 'Portuguese', displayName: 'Portuguese', value: 'pt' },
					{ name: 'Italian', displayName: 'Italian', value: 'it' },
					{ name: 'Arabic', displayName: 'Arabic', value: 'ar' },
					{ name: 'Hindi', displayName: 'Hindi', value: 'hi' },
					{ name: 'Indonesian', displayName: 'Indonesian', value: 'id' },
					{ name: 'Tagalog (Filipino)', displayName: 'Tagalog (Filipino)', value: 'tl' },
					{ name: 'Vietnamese', displayName: 'Vietnamese', value: 'vi' },
					{ name: 'Thai', displayName: 'Thai', value: 'th' },
					{ name: 'Turkish', displayName: 'Turkish', value: 'tr' },
					{ name: 'Polish', displayName: 'Polish', value: 'pl' },
					{ name: 'Dutch', displayName: 'Dutch', value: 'nl' },
					{ name: 'Ukrainian', displayName: 'Ukrainian', value: 'uk' },
					{ name: 'Swedish', displayName: 'Swedish', value: 'sv' },
					{ name: 'Greek', displayName: 'Greek', value: 'el' },
					{ name: 'Czech', displayName: 'Czech', value: 'cs' },
					{ name: 'Malay', displayName: 'Malay', value: 'ms' },
				],
			},
			{
				name: 'content',
				displayName: 'content',
				description: 'Content to translate',
				displayDescription: 'Content to translate',
				type: ApplicationCommandOptionType.STRING,
				required: true,
			},
		],
		execute: async (...execArgs: any[]) => {
			const rawArgs = execArgs[0]
			const ctx = execArgs[1] || {}

			const channelId =
				ctx?.channel?.id ||
				ctx?.channelId ||
				selectedChannelStore?.getChannelId?.() ||
				''

			try {
				const toLangArg = extractArg(rawArgs, 'toLang', 0).trim()
				const contentArg = extractArg(rawArgs, 'content', 1).trim()

				if (!toLangArg || !contentArg) {
					const Alert = getAlert()
					if (Alert?.alert) {
						Alert.alert('Dislate', 'Both <toLang> and <content> are required.')
					} else {
						showToast('Both <toLang> and <content> are required.')
					}
					return
				}

				const targetLang = resolveLanguageCode(toLangArg)
				const langName = LANGUAGES[targetLang] || targetLang.toUpperCase()
				const settings = getSettings()
				const engineName = (settings.engine || 'google').toUpperCase()
				showToast(`Translating to ${langName} via ${engineName}...`)

				;(async () => {
					try {
						const { masked, placeholders } = maskContent(contentArg)

						const res = await translate(masked, {
							engine: settings.engine,
							sourceLang: 'auto',
							targetLang,
						})

						if (!res || !res.translatedText) {
							throw new Error(
								`Translation returned empty result from engine: ${res?.engine || settings.engine}`,
							)
						}

						const translatedText = unmaskContent(res.translatedText, placeholders)
						showTranslateAlert(targetLang, translatedText, channelId)
					} catch (err: any) {
						console.error('[Dislate] /translate error:', err)
						const Alert = getAlert()
						if (Alert?.alert) {
							Alert.alert('Dislate Error', `Translation failed: ${err?.message || err}`)
						} else {
							showToast(`Translation failed: ${err?.message || err}`)
						}
					}
				})()
			} catch (syncErr: any) {
				console.error('[Dislate] /translate sync error:', syncErr)
			}
		},
	}

	// 1. If external command library is available (e.g. dev.cocobo1.command-lib on api.commands)
	if (api?.commands?.commands?.registerCommand) {
		const unregister = api.commands.commands.registerCommand(translateCmd)
		return unregister
	}

	// 2. Standalone registration hooking getBuiltInCommands
	const unsubFinder = getModules(withProps('getBuiltInCommands'), (commandsModule) => {
		let builtIns: any[] = []
		try {
			builtIns = commandsModule.getBuiltInCommands(ApplicationCommandType.CHAT, true, false)
		} catch {
			try {
				builtIns = commandsModule.getBuiltInCommands(
					[ApplicationCommandType.CHAT, ApplicationCommandType.USER, ApplicationCommandType.MESSAGE],
					true,
					false,
				)
			} catch {}
		}

		let lastId = 0
		if (Array.isArray(builtIns) && builtIns.length > 0) {
			const sorted = [...builtIns].sort(
				(a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0),
			)
			lastId = parseInt(sorted[sorted.length - 1]?.id, 10) || 0
		}
		translateCmd.id = (lastId - 1).toString()
		translateCmd.untranslatedName ??= translateCmd.name
		translateCmd.untranslatedDescription ??= translateCmd.description

		if (translateCmd.options) {
			for (const opt of translateCmd.options) {
				opt.displayName ??= opt.name
				opt.displayDescription ??= opt.description
				if (opt.choices) {
					for (const choice of opt.choices) {
						choice.displayName ??= choice.name
					}
				}
			}
		}

		if (!registeredCommands.some((c) => c.name === translateCmd.name)) {
			registeredCommands.push(translateCmd)
		}

		const unpatch = instead(commandsModule, 'getBuiltInCommands', (args, orig) => {
			const res = orig.apply(commandsModule, args) ?? []
			const commandType = args[0]

			const matching = registeredCommands
				.filter((c) => {
					if (Array.isArray(commandType)) {
						return commandType.includes(c.type)
					}
					return c.type === commandType
				})
				.filter((c) => !c.shouldHide?.())

			return res.concat(matching)
		})

		commandCleanups.push(unpatch)
	})

	commandCleanups.push(unsubFinder)

	return () => {
		const idx = registeredCommands.findIndex((c) => c.name === translateCmd.name)
		if (idx !== -1) registeredCommands.splice(idx, 1)
		for (const fn of commandCleanups) {
			try {
				fn()
			} catch {}
		}
		commandCleanups.length = 0
	}
}
