import { ClineAPI, ClineProvider } from "../../../src/exports/cline"
import * as vscode from "vscode"

declare global {
	var api: ClineAPI
	var provider: ClineProvider
	var extension: vscode.Extension<ClineAPI> | undefined
	var panel: vscode.WebviewPanel | undefined
}

export async function run() {
	// Set up global extension, api, provider, and panel.
	globalThis.extension = vscode.extensions.getExtension("RooVeterinaryInc.roo-cline")

	if (!globalThis.extension) {
		throw new Error("Extension not found.")
	}

	globalThis.api = globalThis.extension.isActive
		? globalThis.extension.exports
		: await globalThis.extension.activate()

	globalThis.provider = globalThis.api.sidebarProvider

	await globalThis.provider.updateGlobalState("apiProvider", "openrouter")
	await globalThis.provider.updateGlobalState("openRouterModelId", "anthropic/claude-3.5-sonnet")
	await globalThis.provider.storeSecret("openRouterApiKey", process.env.OPENROUTER_API_KEY || "sk-or-v1-fake-api-key")

	globalThis.panel = vscode.window.createWebviewPanel(
		"roo-cline.SidebarProvider",
		"Roo Code",
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			enableCommandUris: true,
			retainContextWhenHidden: true,
			localResourceRoots: [globalThis.extension?.extensionUri],
		},
	)

	await globalThis.provider.resolveWebviewView(globalThis.panel)

	let startTime = Date.now()
	const timeout = 60000
	const interval = 1000

	while (Date.now() - startTime < timeout) {
		if (globalThis.provider.viewLaunched) {
			break
		}

		await new Promise((resolve) => setTimeout(resolve, interval))
	}

	console.log("Extension loaded.")
}
