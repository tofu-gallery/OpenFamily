// Tofu (2026-10-27): modified for Tofu's app gallery: the open screen's data is also
// asked for again when the page comes back to the front or back online, and every 15
// seconds while it is visible, so a change reaches it when its socket is not connected
// or is held by another process. See TOFU.md.
import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useCallback,
    ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { wsBase } from '../lib/serverConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WsEntity =
    | 'tasks'
    | 'shopping'
    | 'appointments'
    | 'family'
    | 'budget'
    | 'recipes'
    | 'meal-plans'
    | 'planning'
    | 'notifications'
    | 'integrations'
    | 'rewards'
    | 'notes'
    | 'posts';

export type WsAction = 'created' | 'updated' | 'deleted';

export interface WsUpdateMessage {
    type: 'update';
    entity: WsEntity;
    action: WsAction;
}

type Subscriber = () => void;

interface WebSocketContextType {
    /** Subscribe to updates for a given entity. Returns an unsubscribe function. */
    subscribe: (entity: WsEntity, cb: Subscriber) => () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// The WebSocket base is resolved by `wsBase()` (serverConfig): same-origin on the
// web, derived from the configured server URL in the native app.
const IS_DEMO = Boolean(import.meta.env.VITE_DEMO);

const RECONNECT_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

// Tofu (2026-10-27): on Tofu an app may run as several processes, and none of them may
// stay up between requests, so the socket can be closed, or connected to a process that
// never hears about a change another process handled. The screen then reloads what it
// shows when the page comes back to the front or back online, and every 15 seconds while
// it is visible: the same loaders a socket update runs, never while the page is hidden.
// Socket updates work as before.
const REFRESH_WHILE_VISIBLE_MS = 15_000;
// Coming back fires visibilitychange and focus together: one refresh for both.
const REFRESH_MIN_GAP_MS = 2_000;

// ─── Provider ────────────────────────────────────────────────────────────────

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();

    // Map entity → set of subscriber callbacks
    const subscribers = useRef<Map<WsEntity, Set<Subscriber>>>(new Map());

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectDelay = useRef(RECONNECT_DELAY_MS);
    const unmounted = useRef(false);

    // Notify all subscribers for a given entity
    const notify = useCallback((entity: WsEntity) => {
        const cbs = subscribers.current.get(entity);
        if (cbs) {
            cbs.forEach((cb) => cb());
        }
    }, []);

    // Tofu (2026-10-27): every subscriber once, whatever entities it listens to: the
    // loaders of the screen that is open (and of the notification bell).
    const refreshScreen = useCallback(() => {
        const loaders = new Set<Subscriber>();
        subscribers.current.forEach((cbs) => cbs.forEach((cb) => loaders.add(cb)));
        loaders.forEach((cb) => cb());
    }, []);

    const clearPing = () => {
        if (pingTimer.current) {
            clearInterval(pingTimer.current);
            pingTimer.current = null;
        }
    };

    const connect = useCallback(() => {
        if (unmounted.current || !user || IS_DEMO) return;

        // Close any existing socket
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }

        const ws = new WebSocket(`${wsBase()}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
            reconnectDelay.current = RECONNECT_DELAY_MS;

            // Authenticate with JWT; never send the raw userId
            ws.send(JSON.stringify({ type: 'auth', token: api.getToken() }));

            // Heartbeat to keep connection alive through proxies
            clearPing();
            pingTimer.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, PING_INTERVAL_MS);
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data as string) as WsUpdateMessage;
                if (msg.type === 'update' && msg.entity) {
                    notify(msg.entity);
                }
            } catch {
                // ignore malformed frames
            }
        };

        ws.onclose = () => {
            clearPing();
            if (unmounted.current) return;

            // Exponential back-off reconnection
            reconnectTimer.current = setTimeout(() => {
                reconnectDelay.current = Math.min(
                    reconnectDelay.current * 2,
                    RECONNECT_MAX_DELAY_MS,
                );
                connect();
            }, reconnectDelay.current);
        };

        ws.onerror = () => {
            // onclose will fire after onerror, reconnect handled there
            ws.close();
        };
    }, [user, notify]);

    // Connect when user is available, disconnect on logout
    useEffect(() => {
        unmounted.current = false;

        if (user) {
            connect();
        }

        return () => {
            unmounted.current = true;
            clearPing();
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user, connect]);

    // Tofu (2026-10-27): the refresh when the page comes back and while it is visible.
    useEffect(() => {
        if (!user || IS_DEMO) return;

        let timer: ReturnType<typeof setInterval> | null = null;
        let lastRefresh = 0;

        const refresh = () => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastRefresh < REFRESH_MIN_GAP_MS) return;
            lastRefresh = now;
            refreshScreen();
        };
        const stopTimer = () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        };
        const startTimer = () => {
            stopTimer();
            timer = setInterval(refresh, REFRESH_WHILE_VISIBLE_MS);
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refresh();
                startTimer();
            } else {
                stopTimer();
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', refresh);
        window.addEventListener('online', refresh);
        if (document.visibilityState === 'visible') startTimer();

        return () => {
            stopTimer();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('online', refresh);
        };
    }, [user, refreshScreen]);

    const subscribe = useCallback((entity: WsEntity, cb: Subscriber): (() => void) => {
        if (!subscribers.current.has(entity)) {
            subscribers.current.set(entity, new Set());
        }
        subscribers.current.get(entity)!.add(cb);

        return () => {
            subscribers.current.get(entity)?.delete(cb);
        };
    }, []);

    return (
        <WebSocketContext.Provider value={{ subscribe }}>
            {children}
        </WebSocketContext.Provider>
    );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useWebSocket = (): WebSocketContextType => {
    const ctx = useContext(WebSocketContext);
    if (!ctx) {
        throw new Error('useWebSocket must be used inside <WebSocketProvider>');
    }
    return ctx;
};
