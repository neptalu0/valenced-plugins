import { getModule } from '@valenced/modules/finders'
import { byName, byProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import React, { createElement } from 'react'

// ---------------------------------------------------------------------------
// Resolve Discord's internal design components at runtime via metro. These
// names may shift between Discord versions; the lookups are defensive.
// ---------------------------------------------------------------------------

function resolveDesign() {
	const ActionSheet =
		getModule(byName('ActionSheet')) ??
		getModule(byProps('ActionSheet'))?.ActionSheet

	const ActionSheetRow =
		getModule(byName('ActionSheetRow')) ??
		getModule(byProps('ActionSheetRow'))?.ActionSheetRow

	return { ActionSheet, ActionSheetRow }
}

function resolveActionSheetActions() {
	return (
		getModule(byProps('hideActionSheet', 'openLazy')) ??
		getModule(byProps('hideActionSheet'))
	)
}

function resolveIcon() {
	// Try a few known icon names – Discord renames these across builds.
	const iconNames = [
		'TranslateIcon',
		'LanguageIcon',
		'GlobeIcon',
		'ic_locale_24px',
	]
	for (const name of iconNames) {
		const mod = getModule(byName(name))
		if (mod) return mod?.default ?? mod
	}
	return null
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

function findActionSheet(element: any, ActionSheetComp: any): any {
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

function injectTranslateRow(
	tree: any,
	rowElement: any,
	ActionSheetRow: any,
	ActionSheetComp: any,
) {
	const sheet = findActionSheet(tree, ActionSheetComp)
	if (!sheet?.props) return

	const children = [sheet.props.children].flat().filter(Boolean)
	let injected = false

	for (const group of children) {
		if (!group?.props) continue
		const rows = [group.props.children].flat().filter(Boolean)

		// Place after "Forward" if present
		const forwardIdx = rows.findIndex((r: any) => {
			const label = r?.props?.label
			return typeof label === 'string' && label.toLowerCase().includes('forward')
		})
		if (forwardIdx !== -1) {
			rows.splice(forwardIdx + 1, 0, rowElement)
			group.props.children = rows
			injected = true
			break
		}

		// Or place before "Copy Text"
		const copyIdx = rows.findIndex((r: any) => {
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

	// Fallback: new group near the top
	if (!injected && ActionSheetRow?.Group) {
		const newGroup = createElement(ActionSheetRow.Group, null, rowElement)
		children.splice(Math.min(1, children.length), 0, newGroup)
		sheet.props.children = children
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function patchMessageActionSheet(
	onTranslate: (message: any) => Promise<void> | void,
	onRevert: (message: any) => Promise<void> | void,
	isTranslated: (messageId: string) => boolean,
): () => void {
	const { ActionSheet, ActionSheetRow } = resolveDesign()
	const ActionSheetActions = resolveActionSheetActions()
	const IconComp = resolveIcon()

	if (!ActionSheet || !ActionSheetRow) {
		console.warn(
			'[Dislate] Could not resolve ActionSheet design components – action sheet patching skipped.',
		)
		return () => {}
	}

	// Find the LongPressMessageActionSheet component via metro
	const LongPressSheet = getModule(byName('LongPressMessageActionSheet'))
	if (!LongPressSheet) {
		console.warn(
			'[Dislate] LongPressMessageActionSheet not found – will not inject translate button.',
		)
		return () => {}
	}

	const target = LongPressSheet as { default: any }
	const unpatch = instead(target, 'default', (args: any[], Sheet: any) => {
		const tree = Reflect.apply(Sheet, undefined, args)

		try {
			const [{ message }] = args
			if (!message || (!message.content && !isTranslated(message.id))) {
				return tree
			}

			const translated = isTranslated(message.id)
			const label = translated ? 'Revert Message' : 'Translate Message'
			const action = translated ? onRevert : onTranslate

			const row = createElement(ActionSheetRow, {
				label,
				icon: IconComp
					? createElement(ActionSheetRow.Icon, { IconComponent: IconComp })
					: undefined,
				onPress: () => {
					ActionSheetActions?.hideActionSheet?.()
					action(message)
				},
			})

			injectTranslateRow(tree, row, ActionSheetRow, ActionSheet)
		} catch (err) {
			console.error('[Dislate] ActionSheet patch error:', err)
		}

		return tree
	})

	return unpatch
}
