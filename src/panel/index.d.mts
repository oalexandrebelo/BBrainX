export type PanelState = 'unreachable'|'incompatible'|'different-state'|'missing-assets'|'ready'|'timeout'|'connection-error';
export interface PanelStatus {schemaVersion:1;url:string;origin:string;port:number;normalized:boolean;state:PanelState;observedAt:string;durationMs:number;version?:string;instanceId?:string;missingAssets?:number;hint?:string}
export interface PanelHandle {status:PanelStatus;owned:boolean;close():Promise<void>}
export declare function panelTarget(value?:string):{url:string;origin:string;port:number;normalized:boolean};
export declare function probePanel(value:string,options?:{timeoutMs?:number;maxBytes?:number;expectedScope?:string}):Promise<PanelStatus>;
export declare function ensurePanel(value:string,options?:{home?:string;assetsDir?:string}):Promise<PanelHandle>;
export declare function panelStatus(value:string,options?:{home?:string}):Promise<PanelStatus>;
export declare function exportPanelSnapshot(project:string,file:string):Promise<{file:string;bytes:number;sha256:string;live:false;projectRef:string;generation:string;generatedAt:string}>;
