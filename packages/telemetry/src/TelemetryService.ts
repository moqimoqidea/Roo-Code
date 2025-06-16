import EventEmitter from "events"
import { isEqual } from "lodash"
import { RooCodeTelemetryEvent, TelemetryEventName } from "@roo-code/types"
import { v4 as uuidv4 } from "uuid"

export interface TelemetryServiceOptions {
	logEvents?: boolean
	trackEvents?: boolean
	captureRateSamplingPercent?: number
	clientId?: string
	sessionId?: string
}

export class TelemetryService {
	static instance: TelemetryService

	static instantiate(options?: TelemetryServiceOptions) {
		if (!TelemetryService.instance) {
			TelemetryService.instance = new TelemetryService(options ?? {})
		}

		if (options) {
			TelemetryService.instance.logEvents = options?.logEvents ?? TelemetryService.instance.logEvents
			TelemetryService.instance.trackEvents = options?.trackEvents ?? TelemetryService.instance.trackEvents
			TelemetryService.instance.clientId = options?.clientId ?? TelemetryService.instance.clientId
			TelemetryService.instance.sessionId = options?.sessionId ?? TelemetryService.instance.sessionId
		}

		return TelemetryService.instance
	}

	private readonly eventEmitter = new EventEmitter()
	private logEvents: boolean = false
	private trackEvents: boolean = false
	private clientId: string = "default"
	private sessionId: string = uuidv4()
	private captureRateSamplingPercent: number = 100
	private lastEvents: Record<string, RooCodeTelemetryEvent> = {}

	constructor(options: TelemetryServiceOptions) {
		this.logEvents = options?.logEvents ?? this.logEvents
		this.trackEvents = options?.trackEvents ?? this.trackEvents
		this.clientId = options?.clientId ?? this.clientId
		this.sessionId = options?.sessionId ?? this.sessionId
		this.captureRateSamplingPercent = options?.captureRateSamplingPercent ?? this.captureRateSamplingPercent
	}

	public captureEvent(type: TelemetryEventName, data?: Record<string, unknown>, logEvent: boolean = true) {
		if (!this.shouldCaptureEvent()) {
			return
		}

		const event: RooCodeTelemetryEvent = {
			type,
			clientId: this.clientId,
			timestamp: new Date(),
			data,
		}

		const lastEvent = this.lastEvents[type]
		if (lastEvent && isEqual(lastEvent.data, event.data)) {
			return
		}

		this.lastEvents[type] = event

		if (this.logEvents && logEvent) {
			console.log(`Telemetry event captured: ${type}`, data)
		}

		if (this.trackEvents) {
			this.eventEmitter.emit("telemetry", event)
		}

		return event
	}

	public captureSessionStart(): void {
		this.captureEvent(TelemetryEventName.SESSION_STARTED)
	}

	public captureCommandRun(command: string): void {
		this.captureEvent(TelemetryEventName.COMMAND_RUN, { command })
	}

	public captureSlashCommandRun(command: string): void {
		this.captureEvent(TelemetryEventName.SLASH_COMMAND_RUN, { command })
	}

	public captureContextMenuRun(command: string): void {
		this.captureEvent(TelemetryEventName.CONTEXT_MENU_RUN, { command })
	}

	public captureTaskStarted(taskId: string, mode: string, codebaseIndexMode?: string): void {
		this.captureEvent(TelemetryEventName.TASK_STARTED, { taskId, mode, codebaseIndexMode })
	}

	public captureTaskCompleted(
		taskId: string,
		numMessages: number,
		durationMs: number,
		mode: string,
		tokensInput: number,
		tokensOutput: number,
		provider: string,
		modelName: string,
		toolUsage: Record<string, { attempts: number; failures: number }>,
	): void {
		this.captureEvent(TelemetryEventName.TASK_COMPLETED, {
			taskId,
			numMessages,
			durationMs,
			mode,
			tokensInput,
			tokensOutput,
			provider,
			modelName,
			toolUsage,
		})
	}

	public captureTaskCancelled(
		taskId: string,
		numMessages: number,
		durationMs: number,
		mode: string,
		tokensInput: number,
		tokensOutput: number,
		provider: string,
		modelName: string,
		toolUsage: Record<string, { attempts: number; failures: number }>,
	): void {
		this.captureEvent(TelemetryEventName.TASK_CANCELLED, {
			taskId,
			numMessages,
			durationMs,
			mode,
			tokensInput,
			tokensOutput,
			provider,
			modelName,
			toolUsage,
		})
	}

	public captureTaskConversationMessage(taskId: string, textLength: number, isUserMessage: boolean): void {
		this.captureEvent(TelemetryEventName.TASK_CONVERSATION_MESSAGE, { taskId, textLength, isUserMessage })
	}

	public captureLlmError(taskId: string, error: string, provider: string, modelName: string): void {
		this.captureEvent(TelemetryEventName.LLM_ERROR, { taskId, error, provider, modelName })
	}

	public captureToolError(taskId: string, error: string, tool: string): void {
		this.captureEvent(TelemetryEventName.TOOL_ERROR, { taskId, error, tool })
	}

	public captureModeSwitched(taskId: string, mode: string): void {
		this.captureEvent(TelemetryEventName.MODE_SWITCH, { taskId, mode })
	}

	public captureToolUsage(taskId: string, tool: string): void {
		this.captureEvent(TelemetryEventName.TOOL_USED, { taskId, tool })
	}

	public captureNativeToolUsage(taskId: string, tool: string, provider: string, modelId: string): void {
		this.captureEvent(TelemetryEventName.NATIVE_TOOL_USED, { taskId, tool, provider, modelId })
	}

	public captureCheckpointCreated(taskId: string): void {
		this.captureEvent(TelemetryEventName.CHECKPOINT_CREATED, { taskId })
	}

	public captureCheckpointRestored(taskId: string): void {
		this.captureEvent(TelemetryEventName.CHECKPOINT_RESTORED, { taskId })
	}

	public captureCheckpointDiffed(taskId: string): void {
		this.captureEvent(TelemetryEventName.CHECKPOINT_DIFFED, { taskId })
	}

	public captureCheckpointError(taskId: string, error: string): void {
		this.captureEvent(TelemetryEventName.CHECKPOINT_ERROR, { taskId, error })
	}

	public captureProviderSettingsUpdated(provider: string, modelName: string): void {
		this.captureEvent(TelemetryEventName.PROVIDER_SETTINGS_UPDATED, { provider, modelName })
	}

	public captureSubscriptionStateChanged(state: string, provider: string): void {
		this.captureEvent(TelemetryEventName.SUBSCRIPTION_STATE_CHANGED, { state, provider })
	}

	public captureMarketplaceInstallStarted(packageId: string): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_INSTALL_STARTED, { packageId })
	}

	public captureMarketplaceInstallCompleted(packageId: string): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_INSTALL_COMPLETED, { packageId })
	}

	public captureMarketplaceInstallError(packageId: string, error: string): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_INSTALL_ERROR, { packageId, error })
	}

	public captureMarketplaceLoaded(): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_LOADED, {})
	}

	public captureMarketplaceLoadingError(error: string): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_LOADING_ERROR, { error })
	}

	public captureMarketplaceRefreshed(): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_REFRESHED, {})
	}

	public captureMarketplaceRefreshError(error: string): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_REFRESH_ERROR, { error })
	}

	public captureMarketplaceUninstall(packageId: string): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_UNINSTALL, { packageId })
	}

	public captureMarketplaceUninstallError(packageId: string, error: string): void {
		this.captureEvent(TelemetryEventName.MARKETPLACE_UNINSTALL_ERROR, { packageId, error })
	}

	public captureTaskPanelVisibilityChanged(visible: boolean): void {
		this.captureEvent(TelemetryEventName.TASK_PANEL_VISIBILITY_CHANGED, { visible })
	}

	public captureTaskPanelVisibilityTransitionError(error: string): void {
		this.captureEvent(TelemetryEventName.TASK_PANEL_VISIBILITY_TRANSITION_ERROR, { error })
	}

	public captureAuthLoaded(): void {
		this.captureEvent(TelemetryEventName.AUTH_LOADED, {})
	}

	public captureAuthSubmitted(): void {
		this.captureEvent(TelemetryEventName.AUTH_SUBMITTED, {})
	}

	public captureAuthVerified(): void {
		this.captureEvent(TelemetryEventName.AUTH_VERIFIED, {})
	}

	public captureAuthFailed(error: string): void {
		this.captureEvent(TelemetryEventName.AUTH_FAILED, { error })
	}

	public captureAuthCleared(): void {
		this.captureEvent(TelemetryEventName.AUTH_CLEARED, {})
	}

	public captureAuthRequested(): void {
		this.captureEvent(TelemetryEventName.AUTH_REQUESTED, {})
	}

	public captureAuthValidated(): void {
		this.captureEvent(TelemetryEventName.AUTH_VALIDATED, {})
	}

	public captureAuthLoadedFromStorage(): void {
		this.captureEvent(TelemetryEventName.AUTH_LOADED_FROM_STORAGE, {})
	}

	public captureAuthLoadError(error: string): void {
		this.captureEvent(TelemetryEventName.AUTH_LOAD_ERROR, { error })
	}

	public captureLlamaInstallStarted(platform: string, arch: string): void {
		this.captureEvent(TelemetryEventName.LLAMA_INSTALL_STARTED, { platform, arch })
	}

	public captureLlamaInstallCompleted(platform: string, arch: string, durationMs: number): void {
		this.captureEvent(TelemetryEventName.LLAMA_INSTALL_COMPLETED, { platform, arch, durationMs })
	}

	public captureLlamaInstallError(platform: string, arch: string, error: string): void {
		this.captureEvent(TelemetryEventName.LLAMA_INSTALL_ERROR, { platform, arch, error })
	}

	public captureLlamaIndexUpdated(numDocuments: number): void {
		this.captureEvent(TelemetryEventName.LLAMA_INDEX_UPDATED, { numDocuments })
	}

	public captureMcpServerProvisioned(mcpType: string): void {
		this.captureEvent(TelemetryEventName.MCP_SERVER_PROVISIONED, { mcpType })
	}

	public captureMcpServerProvisioningError(mcpType: string, error: string): void {
		this.captureEvent(TelemetryEventName.MCP_SERVER_PROVISIONING_ERROR, { mcpType, error })
	}

	public captureMcpToolUsed(mcpType: string, tool: string): void {
		this.captureEvent(TelemetryEventName.MCP_TOOL_USED, { mcpType, tool })
	}

	public captureMcpToolError(mcpType: string, tool: string, error: string): void {
		this.captureEvent(TelemetryEventName.MCP_TOOL_ERROR, { mcpType, tool, error })
	}

	public captureMcpResourceAccessed(mcpType: string, resourceType: string): void {
		this.captureEvent(TelemetryEventName.MCP_RESOURCE_ACCESSED, { mcpType, resourceType })
	}

	public captureMcpResourceError(mcpType: string, resourceType: string, error: string): void {
		this.captureEvent(TelemetryEventName.MCP_RESOURCE_ERROR, { mcpType, resourceType, error })
	}

	public captureExtensionInstallRecommended(extensionId: string): void {
		this.captureEvent(TelemetryEventName.EXTENSION_INSTALL_RECOMMENDED, { extensionId })
	}

	public captureExtensionInstallStarted(extensionId: string): void {
		this.captureEvent(TelemetryEventName.EXTENSION_INSTALL_STARTED, { extensionId })
	}

	public captureExtensionInstallCompleted(extensionId: string): void {
		this.captureEvent(TelemetryEventName.EXTENSION_INSTALL_COMPLETED, { extensionId })
	}

	public captureExtensionInstallError(extensionId: string, error: string): void {
		this.captureEvent(TelemetryEventName.EXTENSION_INSTALL_ERROR, { extensionId, error })
	}

	public captureEmbeddedViewerOpened(viewType: string): void {
		this.captureEvent(TelemetryEventName.EMBEDDED_VIEWER_OPENED, { viewType })
	}

	public captureEmbeddedViewerError(viewType: string, error: string): void {
		this.captureEvent(TelemetryEventName.EMBEDDED_VIEWER_ERROR, { viewType, error })
	}

	public captureMcpDirectoryShared(mcpType: string, paths: string[]): void {
		this.captureEvent(TelemetryEventName.MCP_DIRECTORY_SHARED, { mcpType, paths })
	}

	public captureMcpDirectoryShareError(mcpType: string, paths: string[], error: string): void {
		this.captureEvent(TelemetryEventName.MCP_DIRECTORY_SHARE_ERROR, { mcpType, paths, error })
	}

	public captureMcpFileUploadStarted(mcpType: string, filePath: string): void {
		this.captureEvent(TelemetryEventName.MCP_FILE_UPLOAD_STARTED, { mcpType, filePath })
	}

	public captureMcpFileUploadCompleted(mcpType: string, filePath: string): void {
		this.captureEvent(TelemetryEventName.MCP_FILE_UPLOAD_COMPLETED, { mcpType, filePath })
	}

	public captureMcpFileUploadError(mcpType: string, filePath: string, error: string): void {
		this.captureEvent(TelemetryEventName.MCP_FILE_UPLOAD_ERROR, { mcpType, filePath, error })
	}

	public captureHumanRelayResponseReceived(status: string): void {
		this.captureEvent(TelemetryEventName.HUMAN_RELAY_RESPONSE_RECEIVED, { status })
	}

	public captureHumanRelayError(error: string): void {
		this.captureEvent(TelemetryEventName.HUMAN_RELAY_ERROR, { error })
	}

	public onEvent(callback: (event: RooCodeTelemetryEvent) => void) {
		this.eventEmitter.on("telemetry", callback)
	}

	public removeEventListener(callback: (event: RooCodeTelemetryEvent) => void) {
		this.eventEmitter.removeListener("telemetry", callback)
	}

	public isTrackingEnabled() {
		return this.trackEvents
	}

	private shouldCaptureEvent() {
		const random = Math.random() * 100
		return random <= this.captureRateSamplingPercent
	}
}