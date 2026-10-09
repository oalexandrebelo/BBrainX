import type { Readable, Writable } from 'node:stream';
export interface EnginePort {
  name: string; version: string;
  list(): Array<{ id: string }>;
  describe(id: string): { description?: string; title?: string; inputSchema: object; outputSchema: object; annotations?: object };
  invoke(id: string, input: unknown, context: { principal: unknown; source: string; signal: AbortSignal }): Promise<unknown>;
}
export interface McpOptions {
  principal?: unknown; source?: string; instructions?: string; isFailure?: (result: unknown) => boolean;
  rateLimit?: { calls: number; perMs: number }; now?: () => number; maxInFlightCalls?: number;
}
export interface McpStdioOptions extends McpOptions {
  input?: Readable; output?: Writable; maxLineBytes?: number; maxPendingMessages?: number; maxBatchItems?: number;
  maxResponseBytes?: number; maxOutputBytes?: number; maxOutputFrames?: number; writeTimeoutMs?: number; shutdownMs?: number;
}
export interface McpHandlerStats {
  running: number; peakRunning: number; admitted: number; busy: number; limited: number; cancelled: number;
  maxInFlightCalls: number; rate: { size: number; capacity: number; perMs: number; validClock: boolean }; scope: string;
}
export interface McpTransportReport {
  frames: number; inputBytes: number; peakPending: number; peakIds: number; unsettledMessages: number;
  drained: boolean; elapsedMs: number; handler: McpHandlerStats;
  output: { queuedFrames: number; queuedBytes: number; peakFrames: number; peakBytes: number; sentFrames: number; sentBytes: number; closed: boolean };
  scope: 'per-stdio-connection'; physicalWorkStopped: null; error: string | null;
}
export declare const MODERN_VERSIONS: readonly string[];
export declare const LEGACY_VERSIONS: readonly string[];
export declare const PROTOCOL_VERSIONS: readonly string[];
export declare function toolName(capabilityId: string): string;
export declare function toolCatalog(engine: EnginePort): { tools: unknown[]; capabilityFor(name: string): string | undefined };
export declare function createMcpHandler(engine: EnginePort, options?: McpOptions): {
  handle(message: unknown): Promise<unknown>; cancelAll(): void; stats(): McpHandlerStats;
};
export declare function serveMcpStdio(engine: EnginePort, options?: McpStdioOptions): Promise<McpTransportReport>;
