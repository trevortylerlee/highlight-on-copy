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
	backgroundColor: "",
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
	}

	onunload() {
		document.documentElement.style.removeProperty("--highlight-on-copy-bg");
		document.documentElement.style.removeProperty("--highlight-on-copy-fg");
		document.documentElement.style.removeProperty("--highlight-on-copy-duration");
	}

	private applyStyles() {
		if (this.settings.backgroundColor) {
			document.documentElement.style.setProperty(
				"--highlight-on-copy-bg",
				this.settings.backgroundColor,
			);
		} else {
			document.documentElement.style.removeProperty("--highlight-on-copy-bg");
		}
		if (this.settings.foregroundColor) {
			document.documentElement.style.setProperty(
				"--highlight-on-copy-fg",
				this.settings.foregroundColor,
			);
		} else {
			document.documentElement.style.removeProperty("--highlight-on-copy-fg");
		}
		document.documentElement.style.setProperty(
			"--highlight-on-copy-duration",
			`${this.settings.duration}ms`,
		);
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

		this.applyStyles();

		if (this.highlightTimeout !== null) {
			window.clearTimeout(this.highlightTimeout);
		}

		document.documentElement.classList.add("copy-highlight-active");

		this.highlightTimeout = window.setTimeout(() => {
			document.documentElement.classList.remove("copy-highlight-active");
			this.highlightTimeout = null;
		}, this.settings.duration);

		if (view.getMode() === "source") {
			const editor = view.editor;
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

		new Setting(containerEl)
			.setName("Background color")
			.setDesc(
				"CSS color for the highlight background. Leave blank to use the default.",
			)
			.addText((t) =>
				t
					.setPlaceholder("rgba(0, 255, 0, 0.5)")
					.setValue(this.plugin.settings.backgroundColor)
					.onChange(async (v) => {
						this.plugin.settings.backgroundColor = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Foreground color")
			.setDesc(
				"CSS color for the text. Leave blank to inherit.",
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
