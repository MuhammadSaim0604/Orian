/**
 * `@mobile-automation/mcp-server`
 *
 * Exposes the device tool set over the Model Context Protocol:
 * `External AI -> MCP -> Agent Tool Gateway -> Android Tool Runtime -> Device`.
 *
 * This grants a remote client the ability to tap, type, and read the screen, so
 * it is the highest-risk surface in the product. It is authenticated and
 * loopback-only unless the user explicitly opts into network exposure.
 *
 * Phase 1 scaffold - the server is built in Phase 10.
 */

export const PACKAGE_NAME = '@mobile-automation/mcp-server' as const;

/** Default bind address. Loopback only - never a wildcard by default. */
export const DEFAULT_BIND_HOST = '127.0.0.1' as const;

/** Authentication is mandatory; there is no anonymous mode. */
export const ANONYMOUS_ACCESS_ALLOWED = false;

export interface McpServerConfig {
  /** Interface to bind. Anything other than loopback needs explicit consent. */
  readonly host: string;
  readonly port: number;
  /** Set only when the user has knowingly accepted network exposure. */
  readonly networkExposureAcknowledged: boolean;
}

export const isLoopbackHost = (host: string): boolean =>
  host === '127.0.0.1' || host === '::1' || host === 'localhost';

/**
 * A configuration is safe when it stays on loopback, or when the user has
 * explicitly acknowledged exposing full device control to the network.
 */
export const isSafeBinding = (config: McpServerConfig): boolean =>
  isLoopbackHost(config.host) || config.networkExposureAcknowledged;
