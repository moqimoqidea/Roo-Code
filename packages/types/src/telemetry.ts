import { z } from "zod"
import { Mode } from "./modes"
import { ProviderSettings } from "./provider-settings"

export enum TelemetryEventName {
	SESSION_STARTED = "Session Started",
	COMMAND_RUN = "Command Run",
	SLASH_COMMAND_RUN = "Slash Command Run",
	CONTEXT_MENU_RUN = "Context Menu Run",
	CODEBASE_INDEXED = "Codebase Indexed",
	CODEBASE_INDEX_ERROR = "Codebase Index Error",
	CODEBASE_SEARCH = "Codebase Search",
	CODEBASE_SEARCH_ERROR = "Codebase Search Error",
	TREE_SEARCH = "Tree Search",
	LLM_ERROR = "LLM Error",
	TOOL_ERROR = "Tool Error",
	TASK_STARTED = "Task Started",
	TASK_COMPLETED = "Task Completed",
	TASK_CANCELLED = "Task Cancelled",
	TASK_CONVERSATION_MESSAGE = "Task Conversation Message",
	LLAMA_INSTALL_STARTED = "Llama Install Started",
	LLAMA_INSTALL_COMPLETED = "Llama Install Completed",
	LLAMA_INSTALL_ERROR = "Llama Install Error",
	LLAMA_INDEX_UPDATED = "Llama Index Updated",
	LLM_COMPLETION = "LLM Completion",
	MODE_SWITCH = "Mode Switched",
	TOOL_USED = "Tool Used",
	NATIVE_TOOL_USED = "Native Tool Used",

	CHECKPOINT_CREATED = "Checkpoint Created",
	CHECKPOINT_RESTORED = "Checkpoint Restored",
	CHECKPOINT_DIFFED = "Checkpoint Diffed",
	CHECKPOINT_ERROR = "Checkpoint Error",

	PROVIDER_SETTINGS_UPDATED = "Provider Settings Updated",
	MARKETPLACE_INSTALL_STARTED = "Marketplace Install Started",
	MARKETPLACE_INSTALL_COMPLETED = "Marketplace Install Completed",
	MARKETPLACE_INSTALL_ERROR = "Marketplace Install Error",
	MARKETPLACE_LOADED = "Marketplace Loaded",
	MARKETPLACE_LOADING_ERROR = "Marketplace Loading Error",
	MARKETPLACE_REFRESHED = "Marketplace Refreshed",
	MARKETPLACE_REFRESH_ERROR = "Marketplace Refresh Error",
	MARKETPLACE_UNINSTALL = "Marketplace Uninstall",
	MARKETPLACE_UNINSTALL_ERROR = "Marketplace Uninstall Error",

	TASK_PANEL_VISIBILITY_CHANGED = "Task Panel Visibility Changed",
	TASK_PANEL_VISIBILITY_TRANSITION_ERROR = "Task Panel Visibility Transition Error",
	AUTH_LOADED = "Auth Loaded",
	AUTH_SUBMITTED = "Auth Submitted",
	AUTH_VERIFIED = "Auth Verified",
	AUTH_FAILED = "Auth Failed",
	AUTH_CLEARED = "Auth Cleared",
	AUTH_REQUESTED = "Auth Requested",
	AUTH_VALIDATED = "Auth Validated",
	AUTH_LOADED_FROM_STORAGE = "Auth Loaded From Storage",
	AUTH_LOAD_ERROR = "Auth Load Error",
	MCP_SERVER_PROVISIONED = "MCP Server Provisioned",
	MCP_SERVER_PROVISIONING_ERROR = "MCP Server Provisioning Error",
	MCP_TOOL_USED = "MCP Tool Used",
	MCP_TOOL_ERROR = "MCP Tool Error",
	MCP_RESOURCE_ACCESSED = "MCP Resource Accessed",
	MCP_RESOURCE_ERROR = "MCP Resource Error",
	SUBSCRIPTION_STATE_CHANGED = "Subscription State Changed",
	EXTENSION_INSTALL_RECOMMENDED = "Extension Install Recommended",
	EXTENSION_INSTALL_STARTED = "Extension Install Started",
	EXTENSION_INSTALL_COMPLETED = "Extension Install Completed",
	EXTENSION_INSTALL_ERROR = "Extension Install Error",
	HUMAN_RELAY_RESPONSE_RECEIVED = "Human Relay Response Received",
	HUMAN_RELAY_ERROR = "Human Relay Error",
	EMBEDDED_VIEWER_OPENED = "Embedded Viewer Opened",
	EMBEDDED_VIEWER_ERROR = "Embedded Viewer Error",
	MCP_DIRECTORY_SHARED = "MCP Directory Shared",
	MCP_DIRECTORY_SHARE_ERROR = "MCP Directory Share Error",
	MCP_FILE_UPLOAD_STARTED = "MCP File Upload Started",
	MCP_FILE_UPLOAD_COMPLETED = "MCP File Upload Completed",
	MCP_FILE_UPLOAD_ERROR = "MCP File Upload Error",
}

const TelemetrySessionStartedEventSchema = z.object({
	type: z.literal(TelemetryEventName.SESSION_STARTED),
	clientId: z.string(),
	timestamp: z.coerce.date(),
})

// This is the general schema for telemetry events
export const rooCodeTelemetryEventSchema = z.discriminatedUnion("type", [
	TelemetrySessionStartedEventSchema,
	z.object({
		type: z.enum([
			TelemetryEventName.COMMAND_RUN,
			TelemetryEventName.SLASH_COMMAND_RUN,
			TelemetryEventName.CONTEXT_MENU_RUN,
			TelemetryEventName.CODEBASE_INDEXED,
			TelemetryEventName.CODEBASE_INDEX_ERROR,
			TelemetryEventName.CODEBASE_SEARCH,
			TelemetryEventName.CODEBASE_SEARCH_ERROR,
			TelemetryEventName.TREE_SEARCH,
			TelemetryEventName.LLM_ERROR,
			TelemetryEventName.TOOL_ERROR,
			TelemetryEventName.TASK_STARTED,
			TelemetryEventName.TASK_COMPLETED,
			TelemetryEventName.TASK_CANCELLED,
			TelemetryEventName.TASK_CONVERSATION_MESSAGE,
			TelemetryEventName.MODE_SWITCH,
			TelemetryEventName.TOOL_USED,
			TelemetryEventName.NATIVE_TOOL_USED,
			TelemetryEventName.CHECKPOINT_CREATED,
			TelemetryEventName.CHECKPOINT_RESTORED,
			TelemetryEventName.CHECKPOINT_DIFFED,
			TelemetryEventName.CHECKPOINT_ERROR,
			TelemetryEventName.PROVIDER_SETTINGS_UPDATED,
			TelemetryEventName.MARKETPLACE_INSTALL_STARTED,
			TelemetryEventName.MARKETPLACE_INSTALL_COMPLETED,
			TelemetryEventName.MARKETPLACE_INSTALL_ERROR,
			TelemetryEventName.MARKETPLACE_LOADED,
			TelemetryEventName.MARKETPLACE_LOADING_ERROR,
			TelemetryEventName.MARKETPLACE_REFRESHED,
			TelemetryEventName.MARKETPLACE_REFRESH_ERROR,
			TelemetryEventName.MARKETPLACE_UNINSTALL,
			TelemetryEventName.MARKETPLACE_UNINSTALL_ERROR,
			TelemetryEventName.TASK_PANEL_VISIBILITY_CHANGED,
			TelemetryEventName.TASK_PANEL_VISIBILITY_TRANSITION_ERROR,
			TelemetryEventName.AUTH_LOADED,
			TelemetryEventName.AUTH_SUBMITTED,
			TelemetryEventName.AUTH_VERIFIED,
			TelemetryEventName.AUTH_FAILED,
			TelemetryEventName.AUTH_CLEARED,
			TelemetryEventName.AUTH_REQUESTED,
			TelemetryEventName.AUTH_VALIDATED,
			TelemetryEventName.AUTH_LOADED_FROM_STORAGE,
			TelemetryEventName.AUTH_LOAD_ERROR,
			TelemetryEventName.LLAMA_INSTALL_STARTED,
			TelemetryEventName.LLAMA_INSTALL_COMPLETED,
			TelemetryEventName.LLAMA_INSTALL_ERROR,
			TelemetryEventName.LLAMA_INDEX_UPDATED,
			TelemetryEventName.LLM_COMPLETION,
			TelemetryEventName.MCP_SERVER_PROVISIONED,
			TelemetryEventName.MCP_SERVER_PROVISIONING_ERROR,
			TelemetryEventName.MCP_TOOL_USED,
			TelemetryEventName.MCP_TOOL_ERROR,
			TelemetryEventName.MCP_RESOURCE_ACCESSED,
			TelemetryEventName.MCP_RESOURCE_ERROR,
			TelemetryEventName.SUBSCRIPTION_STATE_CHANGED,
			TelemetryEventName.EXTENSION_INSTALL_RECOMMENDED,
			TelemetryEventName.EXTENSION_INSTALL_STARTED,
			TelemetryEventName.EXTENSION_INSTALL_COMPLETED,
			TelemetryEventName.EXTENSION_INSTALL_ERROR,
			TelemetryEventName.HUMAN_RELAY_RESPONSE_RECEIVED,
			TelemetryEventName.HUMAN_RELAY_ERROR,
			TelemetryEventName.EMBEDDED_VIEWER_OPENED,
			TelemetryEventName.EMBEDDED_VIEWER_ERROR,
			TelemetryEventName.MCP_DIRECTORY_SHARED,
			TelemetryEventName.MCP_DIRECTORY_SHARE_ERROR,
			TelemetryEventName.MCP_FILE_UPLOAD_STARTED,
			TelemetryEventName.MCP_FILE_UPLOAD_COMPLETED,
			TelemetryEventName.MCP_FILE_UPLOAD_ERROR,
		]),
		clientId: z.string(),
		timestamp: z.coerce.date(),
		data: z.record(z.any()).optional(),
	}),
])

export type RooCodeTelemetryEvent = z.infer<typeof rooCodeTelemetryEventSchema>

export type TelemetryTaskContext = {
	taskId: string
	textLength: number
}

export type TelemetryCommandRunContext = {
	command: string
}

export type TelemetryTaskStartedContext = {
	taskId: string
	mode: Mode
	codebaseIndexMode?: string
}

export type TelemetryTaskCompletedContext = {
	taskId: string
	numMessages: number
	durationMs: number
	mode: Mode
	tokensInput: number
	tokensOutput: number
	provider: string
	modelName: string
	// map of tool name to number of times used
	toolUsage: Record<string, { attempts: number; failures: number }>
}

export type TelemetryTaskCancelledContext = {
	taskId: string
	numMessages: number
	durationMs: number
	mode: Mode
	tokensInput: number
	tokensOutput: number
	provider: string
	modelName: string
	// map of tool name to number of times used
	toolUsage: Record<string, { attempts: number; failures: number }>
}

export type TelemetryTaskConversationMessageContext = {
	taskId: string
	textLength: number
	isUserMessage: boolean
}

export type TelemetryLlmErrorContext = {
	taskId: string
	error: string
	provider: string
	modelName: string
}

export type TelemetryToolErrorContext = {
	taskId: string
	error: string
	tool: string
}

export type TelemetryProviderSettingsUpdatedContext = ProviderSettings

export type TelemetryModeSwitchedContext = {
	taskId: string
	mode: Mode
}

export type TelemetryToolUsedContext = {
	taskId: string
	tool: string
}

export type TelemetryCodebaseIndexedContext = {
	fileCount: number
	durationMs: number
	strategy: string
	tokensIndexed: number
	codebaseSize: number
	resultCount: number
}

export type TelemetryCodebaseSearchContext = {
	query: string
	resultCount: number
	durationMs: number
	model: string
	numCodebaseFiles: number
	numCodebaseTokens: number
}

export type TelemetrySubscriptionStateChangedContext = {
	state: string
	provider: string
}

export type TelemetryLlamaInstallContext = {
	platform: string
	arch: string
}

// This is the schema used for the cline API
export const telemetryEventApiSchema = z.object({
	type: z.string(),
	clientId: z.string(),
	timestamp: z.coerce.date(),
	data: z.record(z.any()).optional(),
})

export type TelemetryEventApi = z.infer<typeof telemetryEventApiSchema>