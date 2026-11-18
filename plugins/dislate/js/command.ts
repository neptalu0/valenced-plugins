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
	execute: (args: any[], ctx: any) => Promise<any> | any
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

let messageUtil: any = null
let botMessageUtil: any = null
const registeredCommands: ApplicationCommand[] = []
const commandCleanups: Array<() => void> = []

export function resolveLanguageCode(input: string): string {
	const raw = input.trim().toLowerCase()
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

function initMessageUtils() {
	if (!messageUtil) {
		const unsub1 = getModules(withProps('sendMessage'), (mod) => {
			if (mod?.sendMessage) messageUtil = mod
		})
		commandCleanups.push(unsub1)
	}
	if (!botMessageUtil) {
		const unsub2 = getModules(withProps('sendBotMessage'), (mod) => {
			if (mod?.sendBotMessage) botMessageUtil = mod
		})
		commandCleanups.push(unsub2)
	}
}

export function registerTranslateCommand(api?: any): () => void {
	initMessageUtils()

	const translateCmd: ApplicationCommand = {
		name: 'translate',
		displayName: 'translate',
		description: 'Translate and send a message in any target language',
		displayDescription: 'Translate and send a message in any target language',
		applicationId: '-1',
		type: ApplicationCommandType.CHAT,
		inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
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
				description: 'Content to translate and send',
				displayDescription: 'Content to translate and send',
				type: ApplicationCommandOptionType.STRING,
				required: true,
			},
		],
		execute: async (args: any[], ctx: any) => {
			const channelId = ctx?.channel?.id
			try {
				const toLangArg = (
					args?.find?.((a: any) => a.name === 'toLang')?.value ??
					args?.[0]?.value ??
					''
				).toString().trim()

				const contentArg = (
					args?.find?.((a: any) => a.name === 'content')?.value ??
					args?.[1]?.value ??
					''
				).toString().trim()

				if (!toLangArg || !contentArg) {
					const bot = botMessageUtil || messageUtil
					if (channelId && bot?.sendBotMessage) {
						bot.sendBotMessage(
							channelId,
							'[Dislate] Both <toLang> and <content> are required.',
						)
					}
					return
				}

				const targetLang = resolveLanguageCode(toLangArg)
				const settings = getSettings()

				const { masked, placeholders } = maskContent(contentArg)

				const res = await translate(masked, {
					engine: settings.engine,
					sourceLang: 'auto',
					targetLang,
				})

				const translatedText = unmaskContent(res.translatedText, placeholders)
				return { content: translatedText }
			} catch (err: any) {
				console.error('[Dislate] /translate command error:', err)
				const bot = botMessageUtil || messageUtil
				if (channelId && bot?.sendBotMessage) {
					bot.sendBotMessage(
						channelId,
						`[Dislate] Translation failed: ${err?.message || err}`,
					)
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
	instead(translateCmd, 'execute', (args, orig) => {
		Promise.resolve(orig.apply(translateCmd, args)).then((ret) => {
			if (ret && typeof ret === 'object' && ret.content) {
				const chId = args?.[1]?.channel?.id
				if (chId && messageUtil?.sendMessage) {
					messageUtil.sendMessage(chId, ret)
				}
			}
		})
	})

	const unsubFinder = getModules(withProps('getBuiltInCommands'), (mod) => {
		commandsModule = mod

		let builtIns: any[] = []
		try {
			builtIns = mod.getBuiltInCommands(ApplicationCommandType.CHAT, true, false)
		} catch {
			try {
				builtIns = mod.getBuiltInCommands(
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

		const unpatch = instead(mod, 'getBuiltInCommands', (args, orig) => {
			const res = orig.apply(mod, args) ?? []
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
