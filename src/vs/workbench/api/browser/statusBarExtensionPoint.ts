/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment, IStatusbarEntryAccessor, IStatusbarEntry, StatusbarAlignment, IStatusbarEntryPriority } from 'vs/workbench/services/statusbar/browser/statusbar';
import { ThemeColor } from 'vs/base/common/themables';
import { Command } from 'vs/editor/common/languages';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { getCodiconAriaLabel } from 'vs/base/common/iconLabels';
import { hash } from 'vs/base/common/hash';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Iterable } from 'vs/base/common/iterator';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { asStatusBarItemIdentifier } from 'vs/workbench/api/common/extHostTypes';


// --- service

export const IExtensionStatusBarItemService = createDecorator<IExtensionStatusBarItemService>('IExtensionStatusBarItemService');

export interface IExtensionStatusBarItemService {
	readonly _serviceBrand: undefined;

	setOrUpdateEntry(id: string, statusId: string, extensionId: string | undefined, name: string, text: string, tooltip: IMarkdownString | string | undefined, command: Command | undefined, color: string | ThemeColor | undefined, backgroundColor: string | ThemeColor | undefined, alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation | undefined): IDisposable;

	hasEntry(id: string): boolean;
}


class ExtensionStatusBarItemService implements IExtensionStatusBarItemService {

	declare readonly _serviceBrand: undefined;

	private readonly _entries: Map<string, { accessor: IStatusbarEntryAccessor; alignment: MainThreadStatusBarAlignment; priority: number }> = new Map();

	constructor(@IStatusbarService private readonly _statusbarService: IStatusbarService) { }

	setOrUpdateEntry(entryId: string, id: string, extensionId: string | undefined, name: string, text: string, tooltip: IMarkdownString | string | undefined, command: Command | undefined, color: string | ThemeColor | undefined, backgroundColor: string | ThemeColor | undefined, alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation | undefined): IDisposable {
		// if there are icons in the text use the tooltip for the aria label
		let ariaLabel: string;
		let role: string | undefined = undefined;
		if (accessibilityInformation) {
			ariaLabel = accessibilityInformation.label;
			role = accessibilityInformation.role;
		} else {
			ariaLabel = getCodiconAriaLabel(text);
			if (tooltip) {
				const tooltipString = typeof tooltip === 'string' ? tooltip : tooltip.value;
				ariaLabel += `, ${tooltipString}`;
			}
		}
		const entry: IStatusbarEntry = { name, text, tooltip, command, color, backgroundColor, ariaLabel, role };

		if (typeof priority === 'undefined') {
			priority = 0;
		}

		let alignment = alignLeft ? StatusbarAlignment.LEFT : StatusbarAlignment.RIGHT;

		// alignment and priority can only be set once (at creation time)
		const existingEntry = this._entries.get(entryId);
		if (existingEntry) {
			alignment = existingEntry.alignment;
			priority = existingEntry.priority;
		}

		// Create new entry if not existing
		if (!existingEntry) {
			let entryPriority: number | IStatusbarEntryPriority;
			if (typeof extensionId === 'string') {
				// We cannot enforce unique priorities across all extensions, so we
				// use the extension identifier as a secondary sort key to reduce
				// the likelyhood of collisions.
				// See https://github.com/microsoft/vscode/issues/177835
				// See https://github.com/microsoft/vscode/issues/123827
				entryPriority = { primary: priority, secondary: hash(extensionId) };
			} else {
				entryPriority = priority;
			}

			this._entries.set(entryId, {
				accessor: this._statusbarService.addEntry(entry, id, alignment, entryPriority),
				alignment,
				priority
			});

		} else {
			// Otherwise update
			existingEntry.accessor.update(entry);
		}

		return toDisposable(() => {
			const entry = this._entries.get(entryId);
			if (entry) {
				entry.accessor.dispose();
				this._entries.delete(entryId);
			}
		});
	}

	hasEntry(id: string): boolean {
		return this._entries.has(id);
	}
}

registerSingleton(IExtensionStatusBarItemService, ExtensionStatusBarItemService, InstantiationType.Delayed);

// --- extension point and reading of it

interface IUserFriendlyStatusItemEntry {
	id: string;
	name: string;
	text: string;
	alignment: 'left' | 'right';
	command?: string;
	priority?: number;
}

function isUserFriendlyStatusItemEntry(obj: any): obj is IUserFriendlyStatusItemEntry {
	return (typeof obj.id === 'string' && obj.id.length > 0)
		&& typeof obj.name === 'string'
		&& typeof obj.text === 'string'
		&& (obj.alignment === 'left' || obj.alignment === 'right')
		&& (obj.command === undefined || typeof obj.command === 'string')
		&& (obj.priority === undefined || typeof obj.priority === 'number');
}

const statusBarItemSchema: IJSONSchema = {
	type: 'object',
	required: ['id', 'text', 'alignment', 'name'],
	properties: {
		id: {
			type: 'string',
			markdownDescription: localize('id', 'The identifier of the status bar entry. Must be unique within the extension. The same value must be used when calling the `vscode.window.createStatusBarItem(id, ...)`-API')
		},
		name: {
			type: 'string',
			description: localize('name', 'The name of the entry, like \'Python Language Indicator\', \'Git Status\' etc. Try to keep the length of the name short, yet descriptive enough that users can understand what the status bar item is about.')
		},
		text: {
			type: 'string',
			description: localize('text', 'The text to show for the entry. You can embed icons in the text by leveraging the `$(<name>)`-syntax, like \'Hello $(globe)!\'')
		},
		command: {
			type: 'string',
			description: localize('command', 'The command to execute when the status bar entry is clicked.')
		},
		alignment: {
			type: 'string',
			enum: ['left', 'right'],
			description: localize('alignment', 'The alignment of the status bar entry.')
		},
		priority: {
			type: 'number',
			description: localize('priority', 'The priority of the status bar entry. Higher value means the item should be shown more to the left.')
		}
	}
};

const statusBarItemsSchema: IJSONSchema = {
	description: localize('vscode.extension.contributes.statusBarItems', "Contributes items to the status bar."),
	oneOf: [
		statusBarItemSchema,
		{
			type: 'array',
			items: statusBarItemSchema
		}
	]
};

const statusBarItemsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IUserFriendlyStatusItemEntry | IUserFriendlyStatusItemEntry[]>({
	extensionPoint: 'statusBarItems',
	jsonSchema: statusBarItemsSchema,
});

export class StatusBarItemsExtensionPoint {

	constructor(@IExtensionStatusBarItemService statusBarItemsService: IExtensionStatusBarItemService) {

		const contributions = new DisposableStore();

		statusBarItemsExtensionPoint.setHandler((extensions) => {

			contributions.clear();

			for (const entry of extensions) {

				if (!isProposedApiEnabled(entry.description, 'contribStatusBarItems')) {
					entry.collector.error(`The ${statusBarItemsExtensionPoint.name} is proposed API`);
					continue;
				}

				const { value, collector } = entry;

				for (const candidate of Iterable.wrap(value)) {
					if (!isUserFriendlyStatusItemEntry(candidate)) {
						collector.error(localize('invalid', "Invalid status bar item contribution."));
						continue;
					}

					const fullItemId = asStatusBarItemIdentifier(entry.description.identifier, candidate.id);

					contributions.add(statusBarItemsService.setOrUpdateEntry(
						fullItemId,
						fullItemId,
						ExtensionIdentifier.toKey(entry.description.identifier),
						candidate.name ?? entry.description.displayName ?? entry.description.name,
						candidate.text,
						undefined, undefined, undefined, undefined,
						candidate.alignment === 'left',
						candidate.priority,
						undefined
					));
				}
			}
		});
	}
}
