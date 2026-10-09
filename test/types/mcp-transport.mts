import {serveMcpStdio,createMcpHandler,type EnginePort,type McpStdioOptions,type McpTransportReport} from '../../src/mcp.mjs';
// Consumidor de tipos; não executado como engine ou prova de inferência.
declare const engine: EnginePort;
const policy: McpStdioOptions={maxInFlightCalls:8,maxOutputBytes:4194304,principal:{id:'host'}};
const report: Promise<McpTransportReport>=serveMcpStdio(engine,policy);
const stats: number=createMcpHandler(engine,policy).stats().running;
void report;void stats;
// @ts-expect-error limites não aceitam strings
const wrong: McpStdioOptions={maxPendingMessages:'unlimited'};
void wrong;
