import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownView,
	Editor,
} from "obsidian";

interface HighlightOnCopySettings {
	backgroundColor: string;
	foregroundColor: string;
	duration: number; // ms
}

const DEFAULT_SETTINGS: HighlightOnCopySettings = {
	backgroundColor: "rgba(0, 255, 0, 0.5)",
	foregroundColor: "",
	duration: 100,
};

export default class HighlightOnCopyPlugin extends Plugin {
	settings: HighlightOnCopySettings;
	private highlightTimeout: number | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new HighlightOnCopySettingTab(this.app, this));
		this.registerDomEvent(document, "copy", this.onCopy.bind(this));
		this.injectStyles();
	}

	onunload() {
		const style = document.getElementById("highlight-on-copy-styles");
		if (style) style.remove();
	}

	private injectStyles() {
		const style = document.createElement("style");
		style.id = "highlight-on-copy-styles";
		style.textContent = `
		:root {
		  --hbg: transparent;
		  --hfg: inherit;
		  --hdur: 100ms;
		}
  
		.copy-highlight-active .cm-content ::selection,
		.copy-highlight-active .markdown-preview-view ::selection {
		  background-color: var(--hbg) !important;
		  color:            var(--hfg) !important;
		  transition:
			background-color var(--hdur) ease-out,
			color            var(--hdur) ease-out;
		}
  
		.cm-editor .highlight-on-copy,
		.cm-selectionBackground.highlight-on-copy {
		  background-color: var(--hbg) !important;
		  color:            var(--hfg) !important;
		  transition:
			background-color var(--hdur) ease-out,
			color            var(--hdur) ease-out;
		}
	  `;
		document.head.appendChild(style);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private onCopy(_ev: ClipboardEvent) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		document.documentElement.style.setProperty(
			"--hbg",
			this.settings.backgroundColor,
		);
		document.documentElement.style.setProperty(
			"--hfg",
			this.settings.foregroundColor || "inherit",
		);
		document.documentElement.style.setProperty(
			"--hdur",
			`${this.settings.duration}ms`,
		);

		if (this.highlightTimeout !== null) {
			window.clearTimeout(this.highlightTimeout);
		}

		document.documentElement.classList.add("copy-highlight-active");

		this.highlightTimeout = window.setTimeout(() => {
			document.documentElement.classList.remove("copy-highlight-active");
			this.highlightTimeout = null;
		}, this.settings.duration);

		if (view.getMode() === "source") {
			const editor = view.editor as Editor;
			if (!this.isCM6(editor)) {
				this.handleCM5Highlight(editor);
			}
		}
	}

	private isCM6(editor: Editor): boolean {
		return "state" in editor && !("cm" in editor);
	}

	private handleCM5Highlight(editor: Editor) {
		const maybeEditorWithCM = editor as Editor & { cm?: CodeMirror.Editor };
		const cm = maybeEditorWithCM.cm;
		if (!cm?.markText) return;

		const sels = cm.listSelections();
		if (!sels?.length) return;
		const { anchor, head } = sels[0];
		let from = anchor,
			to = head;
		if (
			head.line < anchor.line ||
			(head.line === anchor.line && head.ch < anchor.ch)
		) {
			from = head;
			to = anchor;
		}

		const marker = cm.markText(from, to, {
			className: "highlight-on-copy",
			inclusiveLeft: true,
			inclusiveRight: true,
		});
		window.setTimeout(() => marker.clear(), this.settings.duration);
	}
}

class HighlightOnCopySettingTab extends PluginSettingTab {
	plugin: HighlightOnCopyPlugin;

	constructor(app: App, plugin: HighlightOnCopyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Highlight on Copy Settings" });

		new Setting(containerEl)
			.setName("Background color")
			.setDesc("CSS color for the highlight background.")
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.backgroundColor)
					.setValue(this.plugin.settings.backgroundColor)
					.onChange(async (v) => {
						this.plugin.settings.backgroundColor =
							v || DEFAULT_SETTINGS.backgroundColor;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Foreground color")
			.setDesc(
				"Optional CSS color for the text (leave blank to inherit).",
			)
			.addText((t) =>
				t
					.setPlaceholder("inherit")
					.setValue(this.plugin.settings.foregroundColor)
					.onChange(async (v) => {
						this.plugin.settings.foregroundColor = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Animation duration (ms)")
			.setDesc("How long the highlight lasts before fading out.")
			.addText((t) =>
				t
					.setPlaceholder(String(DEFAULT_SETTINGS.duration))
					.setValue(String(this.plugin.settings.duration))
					.onChange(async (v) => {
						const n = parseInt(v);
						this.plugin.settings.duration = isNaN(n)
							? DEFAULT_SETTINGS.duration
							: Math.max(0, n);
						await this.plugin.saveSettings();
					}),
			);
	}
}
