/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorAction2, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { runAccessibilityHelpAction } from 'vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp';
import { clearChatEditor, clearChatSession } from 'vs/workbench/contrib/chat/browser/actions/chatClear';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatDetail, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export const CHAT_CATEGORY = { value: localize('chat.category', "Chat"), original: 'Chat' };

export function registerChatActions() {
	registerEditorAction(class ChatAcceptInput extends EditorAction {
		constructor() {
			super({
				id: 'chat.action.acceptInput',
				label: localize({ key: 'actions.chat.acceptInput', comment: ['Apply input from the chat input box'] }, "Accept Chat Input"),
				alias: 'Accept Chat Input',
				precondition: CONTEXT_IN_CHAT_INPUT,
				kbOpts: {
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyCode.Enter,
					weight: KeybindingWeight.EditorContrib
				}
			});
		}

		run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IChatWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.acceptInput();
			}
		}
	});

	registerAction2(class ClearEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.clear',
				title: {
					value: localize('interactiveSession.clear.label', "Clear"),
					original: 'Clear'
				},
				icon: Codicon.clearAll,
				f1: false,
				menu: [{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 0,
					when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				}]
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}

			await clearChatEditor(accessor, widget);
		}
	});

	registerAction2(class ClearChatHistoryAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.clearHistory',
				title: {
					value: localize('interactiveSession.clearHistory.label', "Clear Input History"),
					original: 'Clear Input History'
				},
				precondition: CONTEXT_PROVIDER_EXISTS,
				category: CHAT_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const historyService = accessor.get(IChatWidgetHistoryService);
			historyService.clearHistory();
		}
	});

	registerAction2(class FocusChatAction extends EditorAction2 {
		constructor() {
			super({
				id: 'chat.action.focus',
				title: { value: localize('actions.interactiveSession.focus', "Focus Chat List"), original: 'Focus Chat List' },
				precondition: CONTEXT_IN_CHAT_INPUT,
				category: CHAT_CATEGORY,
				keybinding: {
					when: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					weight: KeybindingWeight.EditorContrib
				}
			});
		}

		runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IChatWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.focusLastMessage();
			}
		}
	});

	registerEditorAction(class AccessibilityHelpChatAction extends EditorAction {
		constructor() {
			super({
				id: 'chat.action.accessibilityHelp',
				label: localize('chat.action.accessibiltyHelp', "Chat View Accessibility Help"),
				alias: 'Chat View Accessibility Help',
				precondition: CONTEXT_IN_CHAT_INPUT,
				kbOpts: {
					primary: KeyMod.Alt | KeyCode.F1,
					weight: KeybindingWeight.EditorContrib + 10
				}
			});
		}
		async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
			runAccessibilityHelpAction(accessor, editor, 'chat');
		}
	});

	registerAction2(class FocusChatInputAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.focusInput',
				title: {
					value: localize('interactiveSession.focusInput.label', "Focus Chat Input"),
					original: 'Focus Chat Input'
				},
				f1: false,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, ContextKeyExpr.not(EditorContextKeys.focus.key))
				}
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			widgetService.lastFocusedWidget?.focusInput();
		}
	});

	registerAction2(class GlobalClearChatAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.clear`,
				title: {
					value: localize('interactiveSession.clear.label', "Clear"),
					original: 'Clear'
				},
				category: CHAT_CATEGORY,
				icon: Codicon.clearAll,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.WinCtrl | KeyCode.KeyL,
					when: CONTEXT_IN_CHAT_SESSION,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL,
						secondary: [KeyMod.CtrlCmd | KeyCode.KeyK]
					}
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}

			await clearChatSession(accessor, widget);
		}
	});
}

export function getOpenChatEditorAction(id: string, label: string, when?: string) {
	return class OpenChatEditor extends Action2 {
		constructor() {
			super({
				id: `workbench.action.openChat.${id}`,
				title: { value: localize('interactiveSession.open', "Open Editor ({0})", label), original: `Open Editor (${label})` },
				f1: true,
				category: CHAT_CATEGORY,
				precondition: ContextKeyExpr.deserialize(when)
			});
		}

		async run(accessor: ServicesAccessor) {
			const editorService = accessor.get(IEditorService);
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { providerId: id }, pinned: true } });
		}
	};
}

const getClearChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	viewId,
	id: `workbench.action.chat.${providerId}.clear`,
	title: {
		value: localize('interactiveSession.clear.label', "Clear"),
		original: 'Clear'
	},
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.equals('view', viewId),
		group: 'navigation',
		order: 0
	},
	category: CHAT_CATEGORY,
	icon: Codicon.clearAll,
	f1: false
});

export function getClearAction(viewId: string, providerId: string) {
	return class ClearAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getClearChatActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			await view.clear();
		}
	};
}

const getHistoryChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	viewId,
	id: `workbench.action.chat.${providerId}.history`,
	title: {
		value: localize('interactiveSession.history.label', "Show History"),
		original: 'Show History'
	},
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.has('config.interactive.experimental.chatHistory')),
		group: 'navigation',
		order: 0
	},
	category: CHAT_CATEGORY,
	icon: Codicon.history,
	f1: false
});

export function getHistoryAction(viewId: string, providerId: string) {
	return class HistoryAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getHistoryChatActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			const chatService = accessor.get(IChatService);
			const quickInputService = accessor.get(IQuickInputService);
			const editorService = accessor.get(IEditorService);
			const items = chatService.getHistory();
			const picks = items.map(i => (<IQuickPickItem & { chat: IChatDetail }>{
				label: i.title,
				chat: i
			}));
			const selection = await quickInputService.pick(picks, { placeHolder: localize('interactiveSession.history.pick', "Select a chat session to restore") });
			if (selection) {
				const sessionId = selection.chat.sessionId;
				await editorService.openEditor({
					resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId }, pinned: true }
				});
			}
		}
	};
}
