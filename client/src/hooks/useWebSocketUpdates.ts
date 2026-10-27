// Tofu (2026-10-27): modified for Tofu's app gallery: one subscription can listen to
// several entities, so the screen's refresh (WebSocketContext) runs its loader once.
// See TOFU.md.
import { useEffect, useRef } from 'react';
import { useWebSocket, WsEntity } from '../contexts/WebSocketContext';

/**
 * Subscribe to real-time updates for a specific entity (or several entities that
 * share one loader).
 * Calls `onUpdate` whenever another client mutates the entity.
 *
 * Uses an internal ref so that pages never need to wrap their load
 * functions in useCallback; the latest version is always called.
 *
 * `{ refresh: false }`: socket updates only, for a loader that the screen's refresh
 * already runs through another subscription.
 *
 * @example
 * useWebSocketUpdates('tasks', loadTasks);
 * useWebSocketUpdates(['tasks', 'shopping'], loadAll);
 * useWebSocketUpdates('notes', loadNotes, { refresh: false });
 */
export function useWebSocketUpdates(
    entity: WsEntity | WsEntity[],
    onUpdate: () => void,
    options: { refresh?: boolean } = {},
): void {
    const { subscribe } = useWebSocket();

    // Always store the latest callback without re-subscribing
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    });

    const entities = Array.isArray(entity) ? entity.join(',') : entity;
    const refresh = options.refresh !== false;
    useEffect(() => {
        // One callback for every entity, so that a refresh of the screen calls it once.
        const callback = () => onUpdateRef.current();
        const unsubscribes = (entities.split(',') as WsEntity[]).map((e) => subscribe(e, callback, { refresh }));
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entities, refresh, subscribe]);
}
