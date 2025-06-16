import { ToolCallAdapter, ToolCallAdapterOptions, ToolCallAdapterFactory } from "./types"
import { AnthropicToolCallAdapterFactory } from "./anthropic"

/**
 * Factory that creates the appropriate tool call adapter based on provider and model
 */
export class ToolCallAdapterRegistry {
  private factories: Map<string, ToolCallAdapterFactory> = new Map()

  constructor() {
    // Register factories for each provider
    this.registerFactory("anthropic", new AnthropicToolCallAdapterFactory())
    // Future: this.registerFactory("openai", new OpenAiToolCallAdapterFactory())
    // Future: this.registerFactory("gemini", new GeminiToolCallAdapterFactory())
  }

  /**
   * Register a factory for a specific provider
   */
  registerFactory(provider: string, factory: ToolCallAdapterFactory): void {
    this.factories.set(provider, factory)
  }

  /**
   * Create a tool call adapter for a specific provider and model
   */
  createAdapter(provider: string, options: ToolCallAdapterOptions): ToolCallAdapter | null {
    const factory = this.factories.get(provider)
    if (!factory) {
      return null
    }

    return factory.createAdapter(options)
  }

  /**
   * Get an instance of the adapter registry
   */
  static getInstance(): ToolCallAdapterRegistry {
    if (!ToolCallAdapterRegistry.instance) {
      ToolCallAdapterRegistry.instance = new ToolCallAdapterRegistry()
    }
    return ToolCallAdapterRegistry.instance
  }

  private static instance: ToolCallAdapterRegistry
}

/**
 * Create a tool call adapter for a specific provider and model
 */
export function createToolCallAdapter(
  provider: string,
  options: ToolCallAdapterOptions
): ToolCallAdapter | null {
  return ToolCallAdapterRegistry.getInstance().createAdapter(provider, options)
}