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

export interface ApplicationCommandOption {
	name: string
	description: string
	required?: boolean
	type: ApplicationCommandOptionType
	displayName?: string
	displayDescription?: string
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

function insertIntoChatbox(channelId: string, text: string): boolean {
	try {
		const input = chatInputs?.getBestActiveInputForChannelId?.(channelId)
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
	try {
		if (messageActions?.sendMessage && channelId) {
			messageActions.sendMessage(channelId, { content: text }, true)
			return true
		}
	} catch (e) {
		console.error('[Dislate] sendChatMessage error:', e)
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
					text: 'Edit',
					onPress: () => {
						const inserted = insertIntoChatbox(channelId, translatedText)
						if (!inserted) {
							const clip = getClipboard()
							clip?.setString?.(translatedText)
							showToast('Copied translation to clipboard')
						}
					},
				},
				{
					text: 'Send',
					onPress: () => {
						const sent = sendChatMessage(channelId, translatedText)
						if (!sent) {
							showToast('Failed to send message: MessageActions not found')
						}
					},
				},
			],
			{ cancelable: true },
		)
	} else {
		// Fallback: insert directly into message box
		insertIntoChatbox(channelId, translatedText)
	}
}

function initModules() {
	if (!chatInputs) {
		const unsub1 = getModules(withProps('getBestActiveInputForChannelId'), (mod) => {
			if (mod?.getBestActiveInputForChannelId) chatInputs = mod
		})
		commandCleanups.push(unsub1)
	}
	if (!messageActions) {
		const unsub2 = getModules(withProps('sendMessage', 'receiveMessage'), (mod) => {
			if (mod?.sendMessage) messageActions = mod
		})
		commandCleanups.push(unsub2)

		const unsub3 = getModules(withProps('sendMessage'), (mod) => {
			if (mod?.sendMessage && !messageActions) messageActions = mod
		})
		commandCleanups.push(unsub3)
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
		description: 'Translate text to a target language with Send/Edit options',
		displayDescription: 'Translate text to a target language with Send/Edit options',
		applicationId: '-1',
		type: ApplicationCommandType.CHAT,
		inputType: ApplicationCommandInputType.BUILT_IN,
		shouldHide: () => false,
		options: [
			{
				name: 'toLang',
				displayName: 'toLang',
				description: 'Target language code (e.g. es, ja, fr, de, ru) or language name',
				displayDescription: 'Target language code (e.g. es, ja, fr, de, ru) or language name',
				type: ApplicationCommandOptionType.STRING,
				required: true,
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
				showToast(`Translating to ${langName}...`)

				const settings = getSettings()
				const { masked, placeholders } = maskContent(contentArg)

				const res = await translate(masked, {
					engine: settings.engine,
					sourceLang: 'auto',
					targetLang,
				})

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
