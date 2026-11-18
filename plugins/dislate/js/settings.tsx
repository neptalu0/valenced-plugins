import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	ScrollView,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { LANGUAGES } from './languages'
import {
	type DislateSettings,
	getSettings,
	loadSettings,
	saveSettings,
} from './storage'

const ENGINES = [
	{ key: 'google' as const, label: 'Google Translate', desc: 'Fast, free, reliable' },
	{ key: 'lingva' as const, label: 'Lingva', desc: 'Open-source proxy' },
	{ key: 'ai' as const, label: 'AI Translation', desc: 'Context-aware LLM translation' },
]

function SettingRow({
	label,
	description,
	children,
}: {
	label: string
	description?: string
	children: React.ReactNode
}) {
	return (
		<View
			style={{
				flexDirection: 'row',
				justifyContent: 'space-between',
				alignItems: 'center',
				paddingVertical: 12,
				paddingHorizontal: 16,
			}}
		>
			<View style={{ flex: 1, marginRight: 12 }}>
				<Text style={{ fontSize: 16, color: '#fff' }}>{label}</Text>
				{description ? (
					<Text style={{ fontSize: 13, color: '#b9bbbe', marginTop: 2 }}>
						{description}
					</Text>
				) : null}
			</View>
			{children}
		</View>
	)
}

function LanguagePicker({
	value,
	onChange,
	includeAuto,
}: {
	value: string
	onChange: (code: string) => void
	includeAuto?: boolean
}) {
	const entries = Object.entries(LANGUAGES).filter(
		([code]) => includeAuto || code !== 'auto',
	)

	return (
		<ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
			{entries.map(([code, name]) => (
				<TouchableOpacity
					key={code}
					onPress={() => onChange(code)}
					style={{
						paddingVertical: 8,
						paddingHorizontal: 16,
						backgroundColor: value === code ? '#5865f233' : 'transparent',
					}}
				>
					<Text
						style={{
							color: value === code ? '#5865f2' : '#dcddde',
							fontWeight: value === code ? '700' : '400',
						}}
					>
						{name}
					</Text>
				</TouchableOpacity>
			))}
		</ScrollView>
	)
}

export default function DislateSettings() {
	const [settings, setSettings] = useState<DislateSettings>(getSettings())
	const [expandSource, setExpandSource] = useState(false)
	const [expandTarget, setExpandTarget] = useState(false)

	// AI Models state
	const [models, setModels] = useState<string[]>(settings.cachedModels || [])
	const [isFetching, setIsFetching] = useState(false)
	const [fetchStatus, setFetchStatus] = useState('')
	const [dropdownOpen, setDropdownOpen] = useState(false)
	const [modelSearch, setModelSearch] = useState('')

	useEffect(() => {
		loadSettings().then((s) => {
			setSettings(s)
			if (s.cachedModels && s.cachedModels.length > 0) {
				setModels(s.cachedModels)
			}
		})
	}, [])

	function update(patch: Partial<DislateSettings>) {
		saveSettings(patch).then(setSettings)
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
			let list: string[] = []
			if (Array.isArray(data?.data)) {
				list = data.data.map((m: any) => (typeof m === 'string' ? m : m.id)).filter(Boolean)
			} else if (Array.isArray(data)) {
				list = data.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
			} else if (Array.isArray(data?.models)) {
				list = data.models.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
			}

			if (list.length === 0) {
				throw new Error('No models found in response')
			}

			list.sort()
			setModels(list)
			setFetchStatus(`✓ Loaded ${list.length} models`)
			setDropdownOpen(true)
			update({ cachedModels: list })
		} catch (err: any) {
			console.error('[Dislate] Failed to fetch models:', err)
			setFetchStatus(`✗ Error: ${err.message || err}`)
		} finally {
			setIsFetching(false)
		}
	}

	const filteredModels = models.filter((m) =>
		m.toLowerCase().includes(modelSearch.toLowerCase()),
	)

	return (
		<ScrollView style={{ flex: 1, backgroundColor: '#2f3136' }}>
			<Text
				style={{
					fontSize: 12,
					color: '#72767d',
					textTransform: 'uppercase',
					fontWeight: '700',
					paddingHorizontal: 16,
					paddingTop: 16,
					paddingBottom: 4,
				}}
			>
				Translation Engine
			</Text>
			{ENGINES.map(({ key, label, desc }) => (
				<TouchableOpacity
					key={key}
					onPress={() => update({ engine: key })}
					style={{
						paddingVertical: 10,
						paddingHorizontal: 16,
						backgroundColor: settings.engine === key ? '#5865f222' : 'transparent',
					}}
				>
					<Text
						style={{
							color: settings.engine === key ? '#5865f2' : '#dcddde',
							fontWeight: settings.engine === key ? '700' : '400',
						}}
					>
						{label}
					</Text>
					{desc ? (
						<Text style={{ fontSize: 12, color: '#72767d', marginTop: 2 }}>{desc}</Text>
					) : null}
				</TouchableOpacity>
			))}

			{settings.engine === 'ai' && (
				<View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
					<Text
						style={{
							fontSize: 12,
							color: '#72767d',
							textTransform: 'uppercase',
							fontWeight: '700',
							marginBottom: 6,
						}}
					>
						AI Endpoint
					</Text>
					<TextInput
						value={settings.aiEndpoint}
						onChangeText={(v) => update({ aiEndpoint: v })}
						placeholder="https://api.openai.com/v1"
						placeholderTextColor="#72767d"
						style={{
							backgroundColor: '#202225',
							color: '#fff',
							padding: 10,
							borderRadius: 6,
							fontSize: 14,
							marginBottom: 10,
						}}
					/>

					<Text
						style={{
							fontSize: 12,
							color: '#72767d',
							textTransform: 'uppercase',
							fontWeight: '700',
							marginBottom: 6,
						}}
					>
						API Key
					</Text>
					<TextInput
						value={settings.aiApiKey}
						onChangeText={(v) => update({ aiApiKey: v })}
						placeholder="sk-..."
						placeholderTextColor="#72767d"
						secureTextEntry
						style={{
							backgroundColor: '#202225',
							color: '#fff',
							padding: 10,
							borderRadius: 6,
							fontSize: 14,
							marginBottom: 10,
						}}
					/>

					{/* Fetch Models Button */}
					<TouchableOpacity
						onPress={handleFetchModels}
						disabled={isFetching}
						style={{
							backgroundColor: '#5865f2',
							paddingVertical: 10,
							paddingHorizontal: 16,
							borderRadius: 6,
							alignItems: 'center',
							flexDirection: 'row',
							justifyContent: 'center',
							marginBottom: 6,
							opacity: isFetching ? 0.7 : 1,
						}}
					>
						{isFetching ? (
							<ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
						) : null}
						<Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
							{isFetching ? 'Fetching Models...' : 'Fetch Models from Endpoint'}
						</Text>
					</TouchableOpacity>

					{fetchStatus ? (
						<Text
							style={{
								fontSize: 12,
								color: fetchStatus.startsWith('✓')
									? '#57f287'
									: fetchStatus.startsWith('✗')
										? '#ed4245'
										: '#fee75c',
								marginBottom: 10,
							}}
						>
							{fetchStatus}
						</Text>
					) : null}

					{/* Model Dropdown Selection */}
					<Text
						style={{
							fontSize: 12,
							color: '#72767d',
							textTransform: 'uppercase',
							fontWeight: '700',
							marginTop: 6,
							marginBottom: 6,
						}}
					>
						Select Model
					</Text>

					<TouchableOpacity
						onPress={() => setDropdownOpen(!dropdownOpen)}
						style={{
							backgroundColor: '#202225',
							paddingVertical: 12,
							paddingHorizontal: 12,
							borderRadius: 6,
							flexDirection: 'row',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: dropdownOpen ? 6 : 10,
						}}
					>
						<Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>
							{settings.aiModel || 'Select a model'}
						</Text>
						<Text style={{ color: '#b9bbbe', fontSize: 12 }}>
							{dropdownOpen ? '▲' : '▼'}
						</Text>
					</TouchableOpacity>

					{dropdownOpen && (
						<View
							style={{
								backgroundColor: '#202225',
								borderRadius: 6,
								padding: 8,
								marginBottom: 10,
								maxHeight: 250,
							}}
						>
							<TextInput
								value={modelSearch}
								onChangeText={setModelSearch}
								placeholder="Search models..."
								placeholderTextColor="#72767d"
								style={{
									backgroundColor: '#2f3136',
									color: '#fff',
									padding: 8,
									borderRadius: 4,
									fontSize: 13,
									marginBottom: 8,
								}}
							/>
							<ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
								{filteredModels.length === 0 ? (
									<Text style={{ color: '#72767d', padding: 8, fontSize: 13 }}>
										{models.length === 0
											? 'No models fetched yet. Click "Fetch Models" above.'
											: 'No models match your search.'}
									</Text>
								) : (
									filteredModels.map((m) => (
										<TouchableOpacity
											key={m}
											onPress={() => {
												update({ aiModel: m })
												setDropdownOpen(false)
											}}
											style={{
												paddingVertical: 8,
												paddingHorizontal: 10,
												borderRadius: 4,
												backgroundColor:
													settings.aiModel === m ? '#5865f233' : 'transparent',
											}}
										>
											<Text
												style={{
													color: settings.aiModel === m ? '#5865f2' : '#dcddde',
													fontWeight: settings.aiModel === m ? '700' : '400',
													fontSize: 13,
												}}
											>
												{m}
											</Text>
										</TouchableOpacity>
									))
								)}
							</ScrollView>
						</View>
					)}

					<Text style={{ fontSize: 11, color: '#72767d', marginBottom: 10 }}>
						Or enter custom model name:
					</Text>
					<TextInput
						value={settings.aiModel}
						onChangeText={(v) => update({ aiModel: v })}
						placeholder="gpt-4o-mini"
						placeholderTextColor="#72767d"
						style={{
							backgroundColor: '#202225',
							color: '#fff',
							padding: 10,
							borderRadius: 6,
							fontSize: 14,
							marginBottom: 10,
						}}
					/>
				</View>
			)}

			<Text
				style={{
					fontSize: 12,
					color: '#72767d',
					textTransform: 'uppercase',
					fontWeight: '700',
					paddingHorizontal: 16,
					paddingTop: 20,
					paddingBottom: 4,
				}}
			>
				Languages
			</Text>

			<TouchableOpacity
				onPress={() => setExpandSource(!expandSource)}
				style={{ paddingVertical: 12, paddingHorizontal: 16 }}
			>
				<Text style={{ color: '#fff', fontSize: 16 }}>
					Source: {LANGUAGES[settings.sourceLanguage] ?? settings.sourceLanguage}{' '}
					{expandSource ? '▲' : '▼'}
				</Text>
			</TouchableOpacity>
			{expandSource && (
				<LanguagePicker
					value={settings.sourceLanguage}
					onChange={(code) => {
						update({ sourceLanguage: code })
						setExpandSource(false)
					}}
					includeAuto
				/>
			)}

			<TouchableOpacity
				onPress={() => setExpandTarget(!expandTarget)}
				style={{ paddingVertical: 12, paddingHorizontal: 16 }}
			>
				<Text style={{ color: '#fff', fontSize: 16 }}>
					Target: {LANGUAGES[settings.targetLanguage] ?? settings.targetLanguage}{' '}
					{expandTarget ? '▲' : '▼'}
				</Text>
			</TouchableOpacity>
			{expandTarget && (
				<LanguagePicker
					value={settings.targetLanguage}
					onChange={(code) => {
						update({ targetLanguage: code })
						setExpandTarget(false)
					}}
				/>
			)}

			<Text
				style={{
					fontSize: 12,
					color: '#72767d',
					textTransform: 'uppercase',
					fontWeight: '700',
					paddingHorizontal: 16,
					paddingTop: 20,
					paddingBottom: 4,
				}}
			>
				Behaviour
			</Text>

			<SettingRow
				label="Immersive Mode"
				description="Show translation below the original text instead of replacing it."
			>
				<Switch
					value={settings.immersive}
					onValueChange={(v) => update({ immersive: v })}
					trackColor={{ true: '#5865f2', false: '#72767d' }}
				/>
			</SettingRow>

			<SettingRow
				label="Show Original"
				description="Include the original text in the translated message."
			>
				<Switch
					value={settings.showOriginal}
					onValueChange={(v) => update({ showOriginal: v })}
					trackColor={{ true: '#5865f2', false: '#72767d' }}
				/>
			</SettingRow>
		</ScrollView>
	)
}
