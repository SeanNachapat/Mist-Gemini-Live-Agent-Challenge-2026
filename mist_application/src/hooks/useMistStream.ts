'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// 1. TypeScript Interfaces defining the exact expected JSON schema
export interface ThaiCBD {
    category_code: number;
    triage_color: 'Red' | 'Yellow' | 'Green' | 'White' | 'Black' | string;
}

export interface ExtractedClinicalData {
    parameter: string;
    value: string;
    unit: string;
}

export interface Provenance {
    raw_transcript: string;
}

export interface SamdCompliance {
    requires_human_verification: boolean;
    confidence_score: number;
}

export interface MistEventPayload {
    atmist_domain: string;
    nemsis_mapping: string;
    thai_cbd: ThaiCBD;
    extracted_clinical_data: ExtractedClinicalData;
    provenance: Provenance;
    samd_compliance: SamdCompliance;
}

export interface UseMistStreamResult {
    isConnected: boolean;
    latestEvent: MistEventPayload | null;
}

// 2. The Custom Hook
export const useMistStream = (wsUrl: string, missionId?: string): UseMistStreamResult => {
    const [isConnected, setIsConnected] = useState(false);
    const [latestEvent, setLatestEvent] = useState<MistEventPayload | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const connect = useCallback(() => {
        try {
            // Append optional mission parameter if needed by backend routing
            const url = missionId ? `${wsUrl}?missionId=${missionId}` : wsUrl;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                console.log('%c[MIST TERMINAL] UPLINK ESTABLISHED', 'color: #00ff00; font-weight: bold; background: #002200; padding: 2px 4px;');
            };

            ws.onmessage = (event) => {
                try {
                    const payload: MistEventPayload = JSON.parse(event.data);

                    // Update React State
                    setLatestEvent(payload);

                    // Tactical Logger Trigger
                    logTacticalEvent(payload);
                } catch (err) {
                    console.error('%c[MIST TERMINAL] PARSE ERROR', 'color: #ff0000; font-weight: bold;', err);
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                console.log('%c[MIST TERMINAL] UPLINK LOST. RETRYING IN 3s...', 'color: #ff9900; font-weight: bold; background: #331100; padding: 2px 4px;');

                // Automatic reconnection logic
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            ws.onerror = (error) => {
                console.error('[MIST TERMINAL] SOCKET SYSTEM FAULT:', error);
                ws.close(); // Force a close to trigger the clean reconnection loop above
            };

        } catch (error) {
            console.error('[MIST TERMINAL] INITIALIZATION ERROR:', error);
        }
    }, [wsUrl, missionId]);

    useEffect(() => {
        connect();

        return () => {
            // Cleanup on unmount
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                // Nullify onclose so we don't attempt an auto-reconnect when the component unmounts intentionally
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { isConnected, latestEvent };
};

// 3. The Interceptor & Logger
export const logTacticalEvent = (payload: MistEventPayload) => {
    // Map tactical colors based on Thai CBD triage color output
    let hexColor = '#ffffff';
    let bgColor = '#222222';

    const triage = payload.thai_cbd?.triage_color?.toLowerCase();
    if (triage === 'red') {
        hexColor = '#ff4444';
        bgColor = '#330000';
    } else if (triage === 'yellow') {
        hexColor = '#ffaa00';
        bgColor = '#332200';
    } else if (triage === 'green') {
        hexColor = '#00ff00';
        bgColor = '#002200';
    }

    const param = payload.extracted_clinical_data?.parameter || 'UNKNOWN EVENT';
    const val = payload.extracted_clinical_data?.value || '-';
    const unit = payload.extracted_clinical_data?.unit || '';

    // Console Group styling (The collapsed Header block)
    console.groupCollapsed(
        `%c MIST INTERCEPT : ${param.toUpperCase()} [ ${val} ${unit} ] `,
        `color: ${hexColor}; background-color: ${bgColor}; font-family: monospace; font-size: 13px; font-weight: bold; border: 1px solid ${hexColor}; padding: 3px 8px; border-radius: 2px;`
    );

    // Inside the collapsed group
    console.log('%c> RAW PAYLOAD:', 'color: #aaaaaa; font-style: italic; font-family: monospace;');
    console.log(payload);

    console.log(`%c[DOMAIN]%c ${payload.atmist_domain}`, 'color: #00ffff; font-weight: bold; font-family: monospace;', 'color: #ffffff; font-family: monospace;');
    console.log(`%c[NEMSIS]%c ${payload.nemsis_mapping}`, 'color: #00ffff; font-weight: bold; font-family: monospace;', 'color: #ffffff; font-family: monospace;');

    console.log(`%c[TRANSCRIPT]%c "${payload.provenance?.raw_transcript}"`, 'color: #00ffff; font-weight: bold; font-family: monospace;', 'font-style: italic; color: #cccccc; font-family: monospace;');

    if (payload.samd_compliance?.requires_human_verification) {
        console.log(`%c[!] REQUIRES HUMAN VERIFICATION (CONFIDENCE: ${(payload.samd_compliance.confidence_score * 100).toFixed(1)}%)`, 'color: #ff9900; font-weight: bold; font-family: monospace;');
    }

    console.groupEnd();
};
