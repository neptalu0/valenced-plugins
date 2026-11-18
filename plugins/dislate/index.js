(() => {
	'use strict'

	// ---------------------------------------------------------------------------
	// Languages Dictionary
	// ---------------------------------------------------------------------------
	const LANGUAGES = {
		auto: 'Auto Detect',
		af: 'Afrikaans',
		sq: 'Albanian',
		am: 'Amharic',
		ar: 'Arabic',
		hy: 'Armenian',
		az: 'Azerbaijani',
		eu: 'Basque',
		be: 'Belarusian',
		bn: 'Bengali',
		bs: 'Bosnian',
		bg: 'Bulgarian',
		ca: 'Catalan',
		ceb: 'Cebuano',
		zh: 'Chinese (Simplified)',
		'zh-TW': 'Chinese (Traditional)',
		co: 'Corsican',
		hr: 'Croatian',
		cs: 'Czech',
		da: 'Danish',
		nl: 'Dutch',
		en: 'English',
		eo: 'Esperanto',
		et: 'Estonian',
		fi: 'Finnish',
		fr: 'French',
		fy: 'Frisian',
		gl: 'Galician',
		ka: 'Georgian',
		de: 'German',
		el: 'Greek',
		gu: 'Gujarati',
		ht: 'Haitian Creole',
		ha: 'Hausa',
		haw: 'Hawaiian',
		he: 'Hebrew',
		hi: 'Hindi',
		hmn: 'Hmong',
		hu: 'Hungarian',
		is: 'Icelandic',
		ig: 'Igbo',
		id: 'Indonesian',
		ga: 'Irish',
		it: 'Italian',
		ja: 'Japanese',
		jv: 'Javanese',
		kn: 'Kannada',
		kk: 'Kazakh',
		km: 'Khmer',
		rw: 'Kinyarwanda',
		ko: 'Korean',
		ku: 'Kurdish',
		ky: 'Kyrgyz',
		lo: 'Lao',
		la: 'Latin',
		lv: 'Latvian',
		lt: 'Lithuanian',
		lb: 'Luxembourgish',
		mk: 'Macedonian',
		mg: 'Malagasy',
		ms: 'Malay',
		ml: 'Malayalam',
		mt: 'Maltese',
		mi: 'Maori',
		mr: 'Marathi',
		mn: 'Mongolian',
		my: 'Myanmar (Burmese)',
		ne: 'Nepali',
		no: 'Norwegian',
		ny: 'Nyanja (Chichewa)',
		or: 'Odia (Oriya)',
		ps: 'Pashto',
		fa: 'Persian',
		pl: 'Polish',
		pt: 'Portuguese',
		pa: 'Punjabi',
		ro: 'Romanian',
		ru: 'Russian',
		sm: 'Samoan',
		gd: 'Scots Gaelic',
		sr: 'Serbian',
		st: 'Sesotho',
		sn: 'Shona',
		sd: 'Sindhi',
		si: 'Sinhala',
		sk: 'Slovak',
		sl: 'Slovenian',
		so: 'Somali',
		es: 'Spanish',
		su: 'Sundanese',
		sw: 'Swahili',
		sv: 'Swedish',
		tl: 'Tagalog (Filipino)',
		tg: 'Tajik',
		ta: 'Tamil',
		tt: 'Tatar',
		te: 'Telugu',
		th: 'Thai',
		tr: 'Turkish',
		tk: 'Turkmen',
		uk: 'Ukrainian',
		ur: 'Urdu',
		ug: 'Uyghur',
		uz: 'Uzbek',
		vi: 'Vietnamese',
		cy: 'Welsh',
		xh: 'Xhosa',
		yi: 'Yiddish',
		yo: 'Yoruba',
		zu: 'Zulu',
	}

	function getLanguageName(code) {
		return LANGUAGES[code] || code
	}

	// ---------------------------------------------------------------------------
	// Settings & Persistence
	// ---------------------------------------------------------------------------
	const DEFAULT_SETTINGS = {
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

	let currentSettings = { ...DEFAULT_SETTINGS }
	let pluginStorage = null

	function getSettingsPath() {
		try {
			const fs = valenced?.modules?.native?.fs
			const constants = fs?.getConstants?.()
			if (constants?.data) {
				return `${constants.data}/dislate_settings.json`
			}
		} catch (e) {}
		return null
	}

	async function loadSettings(api) {
		if (api?.jsonStorage) {
			pluginStorage = api.jsonStorage
			try {
				const saved = api.jsonStorage.cache || (await api.jsonStorage.get())
				if (saved && typeof saved === 'object') {
					currentSettings = { ...DEFAULT_SETTINGS, ...saved }
				}
			} catch (e) {
				console.warn('[Dislate] Failed to read settings from jsonStorage', e)
			}
		}

		try {
			const fs =
				valenced?.modules?.native?.fs ||
				api?.unscoped?.modules?.native?.fs ||
				globalThis.valenced?.modules?.native?.fs
			const path = getSettingsPath()
			if (path && fs?.existsSync?.(path)) {
				const raw = fs.readFileSync(path)
				if (raw) {
					currentSettings = { ...currentSettings, ...JSON.parse(raw) }
				}
			}
		} catch (e) {
			console.warn('[Dislate] Failed to read settings from fs storage', e)
		}
		return currentSettings
	}

	function saveSettings(patch) {
		currentSettings = { ...currentSettings, ...patch }
		if (pluginStorage?.set) {
			pluginStorage.set(patch).catch((e) => {
				console.warn('[Dislate] Failed to persist settings to jsonStorage', e)
			})
		}
		try {
			const fs =
				valenced?.modules?.native?.fs ||
				globalThis.valenced?.modules?.native?.fs
			const path = getSettingsPath()
			if (path && fs?.writeFileSync) {
				fs.writeFileSync(path, JSON.stringify(currentSettings))
			}
		} catch (e) {
			console.warn('[Dislate] Failed to persist settings to fs storage', e)
		}
		return currentSettings
	}

	// ---------------------------------------------------------------------------
	// Markdown, URL, and Discord Tag Protection
	// ---------------------------------------------------------------------------
	function maskContent(text) {
		const placeholders = []
		function addPlaceholder(match) {
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

	function unmaskContent(text, placeholders) {
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
	// Translation Engines with Fallback & Cache
	// ---------------------------------------------------------------------------
	const translationCache = new Map()

	async function translateGoogle(text, targetLang = 'en', sourceLang = 'auto') {
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
			? data[0].map((item) => item?.[0] ?? '').join('')
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

	async function translateLingva(text, targetLang = 'en', sourceLang = 'auto') {
		const trimmed = text.trim()
		if (!trimmed) {
			return { translatedText: text, sourceLang, targetLang, engine: 'lingva' }
		}

		const src = sourceLang === 'auto' ? 'auto' : sourceLang
		const url = `https://lingva.ml/api/v1/${encodeURIComponent(
			src,
		)}/${encodeURIComponent(targetLang)}/${encodeURIComponent(trimmed)}`

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

	async function translateAI(text, targetLang = 'en', sourceLang = 'auto') {
		const trimmed = text.trim()
		if (!trimmed) {
			return { translatedText: text, sourceLang, targetLang, engine: 'ai' }
		}

		const endpoint = (currentSettings.aiEndpoint || '').trim().replace(/\/+$/, '')
		const apiKey = (currentSettings.aiApiKey || '').trim()
		const model = (currentSettings.aiModel || '').trim()

		if (!endpoint || !apiKey || !model) {
			const missing = []
			if (!endpoint) missing.push('API Endpoint')
			if (!apiKey) missing.push('API Key')
			if (!model) missing.push('Model')
			throw new Error(`AI engine requires ${missing.join(', ')} to be configured in plugin settings.`)
		}

		let url = endpoint
		if (url.endsWith('/chat/completions')) {
			// full URL
		} else if (url.endsWith('/v1')) {
			url = `${url}/chat/completions`
		} else {
			url = `${url}/v1/chat/completions`
		}
		const targetName = getLanguageName(targetLang) || targetLang

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

		if (translatedText.startsWith('"') && translatedText.endsWith('"')) {
			translatedText = translatedText.slice(1, -1).trim()
		}

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

	async function translate(text, options = {}) {
		const engine = options.engine || currentSettings.engine || 'google'
		const targetLang = options.targetLang || currentSettings.targetLanguage || 'en'
		const sourceLang = options.sourceLang || currentSettings.sourceLanguage || 'auto'

		const cacheKey = `${engine}:${sourceLang}:${targetLang}:${text}`
		if (translationCache.has(cacheKey)) {
			const cached = translationCache.get(cacheKey)
			if (cached && cached.translatedText) {
				return cached
			}
		}

		let result = null

		if (engine === 'ai') {
			result = await translateAI(text, targetLang, sourceLang)
		} else if (engine === 'lingva') {
			try {
				result = await translateLingva(text, targetLang, sourceLang)
			} catch (lingvaErr) {
				console.warn('[Dislate] Lingva failed, falling back to Google Translate:', lingvaErr)
				result = await translateGoogle(text, targetLang, sourceLang)
			}
		} else {
			try {
				result = await translateGoogle(text, targetLang, sourceLang)
			} catch (googleErr) {
				console.warn('[Dislate] Google Translate failed, falling back to Lingva:', googleErr)
				result = await translateLingva(text, targetLang, sourceLang)
			}
		}

		if (!result || !result.translatedText) {
			throw new Error(`Translation engine ${engine} produced no result`)
		}

		translationCache.set(cacheKey, result)
		return result
	}

	// ---------------------------------------------------------------------------
	// State & Flux Dispatcher
	// ---------------------------------------------------------------------------
	const messageCache = new Map()

	function getDispatcher() {
		return (
			valenced?.discord?.common?.flux?.Dispatcher ||
			(valenced?.modules?.finders?.lookupModule &&
			valenced?.modules?.finders?.filters?.withProps
				? valenced.modules.finders.lookupModule(
						valenced.modules.finders.filters.withProps('_interceptors'),
					)?.[0]
				: null)
		)
	}

	async function handleTranslate(message) {
		const settings = currentSettings
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

			const dispatcher = getDispatcher()
			dispatcher?.dispatch({
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

	function handleRevert(message) {
		const messageId = message?.id
		const channelId = message?.channel_id
		const originalContent = messageCache.get(messageId)

		if (!messageId || !originalContent) return
		messageCache.delete(messageId)

		const dispatcher = getDispatcher()
		dispatcher?.dispatch({
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
	// Action Sheet Injection Helper
	// ---------------------------------------------------------------------------
	function findActionSheet(element, ActionSheetComp) {
		if (!element || typeof element !== 'object') return null
		if (Array.isArray(element)) {
			for (const child of element) {
				const found = findActionSheet(child, ActionSheetComp)
				if (found) return found
			}
			return null
		}
		const { type, props } = element
		if (type === ActionSheetComp) return element
		return findActionSheet(props?.children, ActionSheetComp)
	}

	function injectTranslateRow(tree, rowElement, ActionSheetRow, ActionSheetComp) {
		const sheet = findActionSheet(tree, ActionSheetComp)
		if (!sheet?.props) return

		const children = [sheet.props.children].flat().filter(Boolean)
		let injected = false

		for (const group of children) {
			if (!group?.props) continue
			const rows = [group.props.children].flat().filter(Boolean)

			const forwardIdx = rows.findIndex((r) => {
				const label = r?.props?.label
				return typeof label === 'string' && label.toLowerCase().includes('forward')
			})
			if (forwardIdx !== -1) {
				rows.splice(forwardIdx + 1, 0, rowElement)
				group.props.children = rows
				injected = true
				break
			}

			const copyIdx = rows.findIndex((r) => {
				const label = r?.props?.label
				return typeof label === 'string' && label.toLowerCase().includes('copy')
			})
			if (copyIdx !== -1) {
				rows.splice(copyIdx, 0, rowElement)
				group.props.children = rows
				injected = true
				break
			}
		}

		if (!injected && ActionSheetRow?.Group) {
			const React = valenced?.react?.React || globalThis.React
			const newGroup = React.createElement(ActionSheetRow.Group, null, rowElement)
			children.splice(Math.min(1, children.length), 0, newGroup)
			sheet.props.children = children
		}
	}

	// ---------------------------------------------------------------------------
	// Settings UI Component (rendered in Valenced Plugin Settings)
	// ---------------------------------------------------------------------------
	function SettingsComponent() {
		const React = valenced?.react?.React || globalThis.React
		const ReactNative = valenced?.react?.ReactNative || globalThis.ReactNative
		if (!React || !ReactNative) return null

		const { View, Text, TouchableOpacity, ScrollView, Switch, TextInput } = ReactNative
		const [settings, setSettings] = React.useState(currentSettings)
		const [expandTarget, setExpandTarget] = React.useState(false)

		// AI Models state
		const [models, setModels] = React.useState(settings.cachedModels || [])
		const [isFetching, setIsFetching] = React.useState(false)
		const [fetchStatus, setFetchStatus] = React.useState('')
		const [dropdownOpen, setDropdownOpen] = React.useState(false)
		const [modelSearch, setModelSearch] = React.useState('')

		function update(patch) {
			const next = saveSettings(patch)
			setSettings({ ...next })
		}

		async function handleFetchModels() {
			const base = (settings.aiEndpoint || '').trim().replace(/\/+$/, '')
			const apiKey = (settings.aiApiKey || '').trim()

			if (!base || !apiKey) {
				setFetchStatus('Enter endpoint & API key first')
				return
			}

			setIsFetching(true)
			setFetchStatus('Fetching models...')
			try {
				let url = base
				if (url.endsWith('/v1')) {
					url = `${url}/models`
				} else if (!url.endsWith('/models')) {
					url = `${url}/v1/models`
				}

				const res = await fetch(url, {
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
				})

				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`)
				}

				const data = await res.json()
				let list = []
				if (Array.isArray(data?.data)) {
					list = data.data.map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean)
				} else if (Array.isArray(data)) {
					list = data.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
				} else if (Array.isArray(data?.models)) {
					list = data.models.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
				}

				if (list.length === 0) {
					throw new Error('No models found in response')
				}

				list.sort()
				setModels(list)
				setFetchStatus(`✓ Loaded ${list.length} models`)
				setDropdownOpen(true)
				update({ cachedModels: list })
			} catch (err) {
				console.error('[Dislate] Failed to fetch models:', err)
				setFetchStatus(`✗ Error: ${err.message || err}`)
			} finally {
				setIsFetching(false)
			}
		}

		const filteredModels = models.filter((m) =>
			m.toLowerCase().includes(modelSearch.toLowerCase()),
		)

		const ENGINES = [
			{ key: 'google', label: 'Google Translate', desc: 'Fast, free, reliable' },
			{ key: 'lingva', label: 'Lingva', desc: 'Open-source proxy' },
			{ key: 'ai', label: 'AI Translation', desc: 'Context-aware LLM translation' },
		]

		return React.createElement(
			ScrollView,
			{ style: { flex: 1, backgroundColor: '#2f3136', padding: 16 } },
			React.createElement(
				Text,
				{
					style: {
						fontSize: 12,
						color: '#b9bbbe',
						textTransform: 'uppercase',
						fontWeight: '700',
						marginBottom: 8,
					},
				},
				'Translation Engine',
			),
			...ENGINES.map(({ key, label, desc }) =>
				React.createElement(
					TouchableOpacity,
					{
						key,
						onPress: () => update({ engine: key }),
						style: {
							paddingVertical: 10,
							paddingHorizontal: 12,
							borderRadius: 6,
							marginBottom: 4,
							backgroundColor:
								settings.engine === key ? '#5865f233' : 'transparent',
						},
					},
					React.createElement(
						Text,
						{
							style: {
								color: settings.engine === key ? '#5865f2' : '#dcddde',
								fontWeight: settings.engine === key ? '700' : '400',
							},
						},
						label,
					),
					desc
						? React.createElement(
								Text,
								{
									style: {
										fontSize: 12,
										color: '#72767d',
										marginTop: 2,
									},
								},
								desc,
							)
						: null,
				),
			),
			settings.engine === 'ai' &&
				React.createElement(
					View,
					{ style: { marginTop: 12, marginBottom: 8 } },
					React.createElement(
						Text,
						{
							style: {
								fontSize: 12,
								color: '#b9bbbe',
								textTransform: 'uppercase',
								fontWeight: '700',
								marginBottom: 4,
							},
						},
						'AI Endpoint',
					),
					React.createElement(TextInput, {
						value: settings.aiEndpoint,
						onChangeText: (v) => update({ aiEndpoint: v }),
						placeholder: 'https://api.openai.com/v1',
						placeholderTextColor: '#72767d',
						style: {
							backgroundColor: '#202225',
							color: '#fff',
							padding: 10,
							borderRadius: 6,
							fontSize: 14,
							marginBottom: 10,
						},
					}),
					React.createElement(
						Text,
						{
							style: {
								fontSize: 12,
								color: '#b9bbbe',
								textTransform: 'uppercase',
								fontWeight: '700',
								marginBottom: 4,
							},
						},
						'API Key',
					),
					React.createElement(TextInput, {
						value: settings.aiApiKey,
						onChangeText: (v) => update({ aiApiKey: v }),
						placeholder: 'sk-...',
						placeholderTextColor: '#72767d',
						secureTextEntry: true,
						style: {
							backgroundColor: '#202225',
							color: '#fff',
							padding: 10,
							borderRadius: 6,
							fontSize: 14,
							marginBottom: 10,
						},
					}),

					// Fetch Models Button
					React.createElement(
						TouchableOpacity,
						{
							onPress: handleFetchModels,
							disabled: isFetching,
							style: {
								backgroundColor: '#5865f2',
								paddingVertical: 10,
								paddingHorizontal: 16,
								borderRadius: 6,
								alignItems: 'center',
								marginBottom: 6,
								opacity: isFetching ? 0.7 : 1,
							},
						},
						React.createElement(
							Text,
							{ style: { color: '#fff', fontWeight: '700', fontSize: 14 } },
							isFetching ? 'Fetching Models...' : 'Fetch Models from Endpoint',
						),
					),

					// Status text
					fetchStatus
						? React.createElement(
								Text,
								{
									style: {
										fontSize: 12,
										color: fetchStatus.startsWith('✓')
											? '#57f287'
											: fetchStatus.startsWith('✗')
												? '#ed4245'
												: '#fee75c',
										marginBottom: 10,
									},
								},
								fetchStatus,
							)
						: null,

					// Selected Model Label
					React.createElement(
						Text,
						{
							style: {
								fontSize: 12,
								color: '#b9bbbe',
								textTransform: 'uppercase',
								fontWeight: '700',
								marginTop: 6,
								marginBottom: 4,
							},
						},
						'Select Model',
					),

					// Dropdown Button
					React.createElement(
						TouchableOpacity,
						{
							onPress: () => setDropdownOpen(!dropdownOpen),
							style: {
								backgroundColor: '#202225',
								paddingVertical: 12,
								paddingHorizontal: 12,
								borderRadius: 6,
								flexDirection: 'row',
								justifyContent: 'space-between',
								alignItems: 'center',
								marginBottom: dropdownOpen ? 6 : 10,
							},
						},
						React.createElement(
							Text,
							{ style: { color: '#fff', fontSize: 14, fontWeight: '500' } },
							settings.aiModel || 'Select a model',
						),
						React.createElement(
							Text,
							{ style: { color: '#b9bbbe', fontSize: 12 } },
							dropdownOpen ? '▲' : '▼',
						),
					),

					// Dropdown list
					dropdownOpen &&
						React.createElement(
							View,
							{
								style: {
									backgroundColor: '#202225',
									borderRadius: 6,
									padding: 8,
									marginBottom: 10,
								},
							},
							React.createElement(TextInput, {
								value: modelSearch,
								onChangeText: setModelSearch,
								placeholder: 'Search models...',
								placeholderTextColor: '#72767d',
								style: {
									backgroundColor: '#2f3136',
									color: '#fff',
									padding: 8,
									borderRadius: 4,
									fontSize: 13,
									marginBottom: 8,
								},
							}),
							React.createElement(
								ScrollView,
								{ style: { maxHeight: 180 }, nestedScrollEnabled: true },
								filteredModels.length === 0
									? React.createElement(
											Text,
											{ style: { color: '#72767d', padding: 8, fontSize: 13 } },
											models.length === 0
												? 'No models fetched yet. Click "Fetch Models" above.'
												: 'No models match your search.',
										)
									: filteredModels.map((m) =>
											React.createElement(
												TouchableOpacity,
												{
													key: m,
													onPress: () => {
														update({ aiModel: m })
														setDropdownOpen(false)
													},
													style: {
														paddingVertical: 8,
														paddingHorizontal: 10,
														borderRadius: 4,
														backgroundColor:
															settings.aiModel === m ? '#5865f233' : 'transparent',
													},
												},
												React.createElement(
													Text,
													{
														style: {
															color:
																settings.aiModel === m ? '#5865f2' : '#dcddde',
															fontWeight: settings.aiModel === m ? '700' : '400',
															fontSize: 13,
														},
													},
													m,
												),
											),
										),
							),
						),

					React.createElement(
						Text,
						{ style: { fontSize: 11, color: '#72767d', marginBottom: 4 } },
						'Or enter custom model name:',
					),
					React.createElement(TextInput, {
						value: settings.aiModel,
						onChangeText: (v) => update({ aiModel: v }),
						placeholder: 'e.g. gpt-4o-mini',
						placeholderTextColor: '#72767d',
						style: {
							backgroundColor: '#202225',
							color: '#fff',
							padding: 10,
							borderRadius: 6,
							fontSize: 14,
							marginBottom: 10,
						},
					}),
				),
			React.createElement(
				Text,
				{
					style: {
						fontSize: 12,
						color: '#b9bbbe',
						textTransform: 'uppercase',
						fontWeight: '700',
						marginTop: 20,
						marginBottom: 8,
					},
				},
				'Languages',
			),
			React.createElement(
				TouchableOpacity,
				{
					onPress: () => setExpandTarget(!expandTarget),
					style: {
						paddingVertical: 12,
						paddingHorizontal: 12,
						backgroundColor: '#202225',
						borderRadius: 6,
						marginBottom: 8,
					},
				},
				React.createElement(
					Text,
					{ style: { color: '#fff', fontSize: 15 } },
					`Target Language: ${getLanguageName(settings.targetLanguage)} ${expandTarget ? '▲' : '▼'}`,
				),
			),
			expandTarget &&
				React.createElement(
					ScrollView,
					{ style: { maxHeight: 180, marginBottom: 12 }, nestedScrollEnabled: true },
					Object.entries(LANGUAGES)
						.filter(([code]) => code !== 'auto')
						.map(([code, name]) =>
							React.createElement(
								TouchableOpacity,
								{
									key: code,
									onPress: () => {
										update({ targetLanguage: code })
										setExpandTarget(false)
									},
									style: {
										paddingVertical: 8,
										paddingHorizontal: 12,
										backgroundColor:
											settings.targetLanguage === code ? '#5865f233' : 'transparent',
									},
								},
								React.createElement(
									Text,
									{
										style: {
											color:
												settings.targetLanguage === code ? '#5865f2' : '#dcddde',
										},
									},
									name,
								),
							),
						),
				),
			React.createElement(
				View,
				{
					style: {
						flexDirection: 'row',
						justifyContent: 'space-between',
						alignItems: 'center',
						paddingVertical: 12,
						marginTop: 12,
					},
				},
				React.createElement(
					View,
					{ style: { flex: 1, marginRight: 12 } },
					React.createElement(
						Text,
						{ style: { fontSize: 16, color: '#fff' } },
						'Immersive Mode',
					),
					React.createElement(
						Text,
						{ style: { fontSize: 13, color: '#b9bbbe', marginTop: 2 } },
						'Show translation below the original message instead of replacing it.',
					),
				),
				React.createElement(Switch, {
					value: settings.immersive,
					onValueChange: (v) => update({ immersive: v }),
					trackColor: { true: '#5865f2', false: '#72767d' },
				}),
			),
		)
	}

	function resolveLanguageCode(input) {
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

	const localCleanups = []

	// ---------------------------------------------------------------------------
	// Plugin Definition
	// ---------------------------------------------------------------------------
	return {
		default: plugin({
			async start(api) {
				await loadSettings(api)
				console.log('[Dislate] Dislate EX initialized (AI model fetch & slash command enabled)')

				const React = valenced?.react?.React || globalThis.React
				const getModules = valenced?.modules?.finders?.getModules
				const withName = valenced?.modules?.finders?.filters?.withName
				const withProps = valenced?.modules?.finders?.filters?.withProps
				const instead = valenced?.patcher?.instead
				const Design = valenced?.discord?.design?.Design
				const ActionSheetActionCreators =
					valenced?.discord?.actions?.ActionSheetActionCreators
				const lookupGeneratedIconComponent =
					valenced?.utils?.discord?.lookupGeneratedIconComponent

				if (getModules && withName && instead) {
					const unsubscribe = getModules(
						withName('LongPressMessageActionSheet'),
						(mod) => {
							const module = mod
							const unpatch = instead(module, 'default', (args, Sheet) => {
								const tree = Reflect.apply(Sheet, undefined, args)
								try {
									const [{ message }] = args
									if (
										!message ||
										(!message.content && !messageCache.has(message.id))
									) {
										return tree
									}

									const isTranslated = messageCache.has(message.id)
									const label = isTranslated
										? 'Revert Message'
										: 'Translate Message'
									const action = isTranslated ? handleRevert : handleTranslate

									const IconComp =
										lookupGeneratedIconComponent?.('TranslateIcon') ||
										lookupGeneratedIconComponent?.('LanguageIcon')

									const ActionSheetRow = Design?.ActionSheetRow
									const ActionSheet = Design?.ActionSheet

									if (!ActionSheetRow) return tree

									const row = React.createElement(ActionSheetRow, {
										label,
										icon: IconComp
											? React.createElement(ActionSheetRow.Icon, {
													IconComponent: IconComp,
												})
											: undefined,
										onPress: () => {
											ActionSheetActionCreators?.hideActionSheet?.()
											action(message)
										},
									})

									injectTranslateRow(
										tree,
										row,
										ActionSheetRow,
										ActionSheet,
									)
								} catch (err) {
									console.error('[Dislate] ActionSheet patch error:', err)
								}
								return tree
							})

							if (api?.cleanup) {
								api.cleanup(unpatch)
							}
							localCleanups.push(unpatch)
						},
						{ returnNamespace: true },
					)

					if (api?.cleanup) {
						api.cleanup(unsubscribe)
					}
					localCleanups.push(unsubscribe)
				}

				// -------------------------------------------------------------------
				// /translate <toLang> <content> Slash Command
				// -------------------------------------------------------------------
				let chatInputs = null
				let messageActions = null
				let selectedChannelStore = null

				function extractArg(args, name, index) {
					if (!args) return ''
					if (Array.isArray(args)) {
						const item = args.find(
							(a) =>
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

				function getAlert() {
					return (
						valenced?.react?.ReactNative?.Alert ||
						globalThis.ReactNative?.Alert ||
						null
					)
				}

				function getClipboard() {
					return (
						valenced?.externals?.ReactNativeClipboard?.Clipboard ||
						valenced?.react?.ReactNative?.Clipboard ||
						globalThis.ReactNative?.Clipboard ||
						null
					)
				}

				function showToast(text) {
					try {
						const ToastActionCreators = valenced?.discord?.actions?.ToastActionCreators
						if (ToastActionCreators?.open) {
							ToastActionCreators.open('DISLATE_TOAST', { text, variant: 'default' })
						}
					} catch {}
				}

				function findModuleByProps(...props) {
					try {
						const finders =
							valenced?.modules?.finders ||
							globalThis.valenced?.modules?.finders
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

				function getSelectedChannelId() {
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
					const explicit =
						valenced?.discord?.actions?.MessageActions ||
						globalThis.valenced?.discord?.actions?.MessageActions
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

				function insertIntoChatbox(channelId, text) {
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

				function sendChatMessage(channelId, text) {
					const targetChannelId = channelId || getSelectedChannelId()
					const actions = resolveMessageActions()

					if (actions?.sendMessage && targetChannelId) {
						try {
							const res = actions.sendMessage(targetChannelId, { content: text })
							if (res && typeof res.catch === 'function') {
								res.catch((err) => {
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

					// Fallback if MessageActions or channelId couldn't be resolved or threw
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

				function showTranslateAlert(targetLang, translatedText, channelId) {
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
						const targetChannelId = channelId || getSelectedChannelId()
						insertIntoChatbox(targetChannelId, translatedText)
					}
				}

				if (getModules && withProps) {
					const unsubInputs = getModules(
						withProps('getBestActiveInputForChannelId'),
						(mod) => {
							if (mod?.getBestActiveInputForChannelId) chatInputs = mod
						},
					)
					if (api?.cleanup) api.cleanup(unsubInputs)
					localCleanups.push(unsubInputs)

					const unsubStore = getModules(
						withProps('getChannelId', 'getVoiceChannelId'),
						(mod) => {
							if (mod?.getChannelId) selectedChannelStore = mod
						},
					)
					if (api?.cleanup) api.cleanup(unsubStore)
					localCleanups.push(unsubStore)
				}

				const translateCmd = {
					name: 'translate',
					displayName: 'translate',
					description: 'Translate text to a target language',
					displayDescription: 'Translate text to a target language',
					applicationId: '-1',
					type: 1, // ApplicationCommandType.CHAT
					inputType: 0, // ApplicationCommandInputType.BUILT_IN
					shouldHide: () => false,
					options: [
						{
							name: 'toLang',
							displayName: 'toLang',
							description: 'Target language to translate into',
							displayDescription: 'Target language to translate into',
							type: 3, // ApplicationCommandOptionType.STRING
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
							type: 3, // ApplicationCommandOptionType.STRING
							required: true,
						},
					],
					execute: (...execArgs) => {
						const rawArgs = execArgs[0]
						const ctx = execArgs[1] || {}

						const channelId =
							ctx?.channel?.id ||
							ctx?.channelId ||
							selectedChannelStore?.getChannelId?.() ||
							''

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
						const engineName = (currentSettings.engine || 'google').toUpperCase()
						showToast(`Translating to ${langName} via ${engineName}...`)

						// Asynchronously run translation without blocking Discord command runner
						;(async () => {
							try {
								const { masked, placeholders } = maskContent(contentArg)

								const res = await translate(masked, {
									engine: currentSettings.engine,
									sourceLang: 'auto',
									targetLang,
								})

								if (!res || !res.translatedText) {
									throw new Error(
										`Translation returned empty result from engine: ${res?.engine || currentSettings.engine}`,
									)
								}

								const translatedText = unmaskContent(res.translatedText, placeholders)
								showTranslateAlert(targetLang, translatedText, channelId)
							} catch (err) {
								console.error('[Dislate] /translate error:', err)
								const Alert = getAlert()
								if (Alert?.alert) {
									Alert.alert('Dislate Error', `Translation failed: ${err?.message || err}`)
								} else {
									showToast(`Translation failed: ${err?.message || err}`)
								}
							}
						})()
					},
				}

				if (api?.commands?.commands?.registerCommand) {
					const unregister = api.commands.commands.registerCommand(translateCmd)
					if (api?.cleanup) api.cleanup(unregister)
					localCleanups.push(unregister)
				} else if (getModules && withProps && instead) {
					const unsubCmds = getModules(withProps('getBuiltInCommands'), (commandsModule) => {
						let builtIns = []
						try {
							builtIns = commandsModule.getBuiltInCommands(1, true, false)
						} catch {
							try {
								builtIns = commandsModule.getBuiltInCommands([1, 2, 3], true, false)
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
						translateCmd.untranslatedName = translateCmd.name
						translateCmd.untranslatedDescription = translateCmd.description

						if (translateCmd.options) {
							for (const opt of translateCmd.options) {
								opt.displayName = opt.name
								opt.displayDescription = opt.description
								if (opt.choices) {
									for (const choice of opt.choices) {
										choice.displayName = choice.name
									}
								}
							}
						}

						const unpatchBuiltIn = instead(commandsModule, 'getBuiltInCommands', (args, orig) => {
							const res = orig.apply(commandsModule, args) ?? []
							const commandType = args[0]
							const matchType = Array.isArray(commandType)
								? commandType.includes(translateCmd.type)
								: translateCmd.type === commandType
							if (matchType && !translateCmd.shouldHide?.()) {
								return res.concat([translateCmd])
							}
							return res
						})
						if (api?.cleanup) api.cleanup(unpatchBuiltIn)
						localCleanups.push(unpatchBuiltIn)
					})
					if (api?.cleanup) api.cleanup(unsubCmds)
					localCleanups.push(unsubCmds)
				}

				// Expose globally for devtools / console debugging
				globalThis.Dislate = {
					translate,
					translateAI,
					handleTranslate,
					handleRevert,
					getSettings: () => currentSettings,
					saveSettings,
					messageCache,
				}
			},

			stop() {
				console.log('[Dislate] Dislate EX stopped')
				if (globalThis.Dislate) {
					delete globalThis.Dislate
				}
				for (const fn of localCleanups) {
					try {
						fn()
					} catch {}
				}
				localCleanups.length = 0
				messageCache.clear()
				translationCache.clear()
			},

			SettingsComponent,
		}),
	}
})()
