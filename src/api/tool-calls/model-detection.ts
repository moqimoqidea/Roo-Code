import { CLAUDE_MODELS_WITH_TOOL_CALLING } from "./anthropic"

// List of OpenAI models with function calling support
const OPENAI_MODELS_WITH_TOOL_CALLING = [
  "gpt-4",
  "gpt-4-turbo",
  "gpt-4-turbo-preview",
  "gpt-4-1106-preview",
  "gpt-4-0125-preview",
  "gpt-4-0613",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-0125"
]

// List of Gemini models with function calling support
const GEMINI_MODELS_WITH_TOOL_CALLING = [
  "gemini-pro",
  "gemini-1.0-pro",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
]

/**
 * Check if a model from a specific provider supports native tool calling
 */
export function modelSupportsNativeToolCalling(provider: string, modelId?: string): boolean {
  if (!modelId) {
    return false
  }

  switch (provider) {
    case "anthropic":
      return CLAUDE_MODELS_WITH_TOOL_CALLING.includes(modelId)
    
    case "openai":
      // Check for specific OpenAI models
      return OPENAI_MODELS_WITH_TOOL_CALLING.some(model => 
        modelId.startsWith(model)
      )
    
    case "gemini":
      // Check for specific Gemini models
      return GEMINI_MODELS_WITH_TOOL_CALLING.some(model => 
        modelId.startsWith(model)
      )
    
    default:
      return false
  }
}

/**
 * Get a list of provider models that support native tool calling
 */
export function getModelsWithNativeToolCalling(): Record<string, string[]> {
  return {
    anthropic: CLAUDE_MODELS_WITH_TOOL_CALLING,
    openai: OPENAI_MODELS_WITH_TOOL_CALLING,
    gemini: GEMINI_MODELS_WITH_TOOL_CALLING
  }
}