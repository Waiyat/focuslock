import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { createRealtimeService } from '../realtime';
import type {
  RealtimeConnectionStatus,
  RealtimeEventMap,
  RealtimePayload,
  RealtimeService,
} from '../realtime';

export interface UseRealtimeOptions<T> {
  /**
   * Profile (auth user) id to stream. When omitted, the currently
   * signed-in Supabase session is used.
   */
  profileId?: string;
  /** Load authoritative rows from the DB (initial load + `reload()`). */
  refresh: (service: RealtimeService) => Promise<T[]>;
  /** Merge one realtime delta into the current rows. Defaults to `defaultMerge`. */
  merge?: (currentState: T[], payload: RealtimePayload<T>) => T[];
}

export interface UseRealtimeResult<T> {
  data: T[];
  isLoading: boolean;
  reload: () => Promise<void>;
  connectionStatus: RealtimeConnectionStatus;
}

/**
 * Stable identity for a row: the primary key when present, otherwise the
 * natural key of `app_limits` rows (`app_bundle_id`).
 */
function rowIdentity(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const candidate = record.id ?? record.app_bundle_id;
  if (typeof candidate === 'string') return candidate;
  if (typeof candidate === 'number') return String(candidate);
  return null;
}

/**
 * Default merge: INSERT upserts, UPDATE patches, DELETE removes.
 *
 * The previous default spread the incoming row over EVERY item, which both
 * corrupted sibling rows and silently dropped inserts/deletes.
 */
function defaultMerge<T>(rows: T[], payload: RealtimePayload<T>): T[] {
  const isDelete = payload.eventType === 'DELETE';
  // DELETE carries the row in `old`; INSERT/UPDATE carry it in `new`.
  const incoming = (isDelete ? payload.old : payload.new) as unknown;
  if (!incoming || typeof incoming !== 'object') return rows;

  const key = rowIdentity(incoming);

  if (isDelete) {
    return key === null ? rows : rows.filter((row) => rowIdentity(row) !== key);
  }

  if (key !== null && rows.some((row) => rowIdentity(row) === key)) {
    return rows.map((row) =>
      rowIdentity(row) === key ? ({ ...row, ...(incoming as Partial<T>) } as T) : row
    );
  }

  return [...rows, incoming as T];
}

/**
 * Typed hook for consuming a realtime projection from the RealtimeService.
 *
 * Usage:
 *   const { data, isLoading, reload, connectionStatus } =
 *     useRealtimeProjection<AppLimitItem>('limits', {
 *       refresh: (service) => service.refresh<AppLimitItem>('app_limits'),
 *     });
 *
 * @param event Projection to subscribe to (e.g. 'limits', 'resetWindow').
 * @param options.profileId  Optional profile id; defaults to the signed-in session.
 * @param options.refresh    Loads authoritative rows from the DB.
 * @param options.merge      Merges one realtime delta into the current rows.
 * @returns { data, isLoading, reload, connectionStatus }
 */
export function useRealtimeProjection<T>(
  event: RealtimeEventMap,
  options: UseRealtimeOptions<T>
): UseRealtimeResult<T> {
  const { profileId, refresh, merge } = options;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('disconnected');

  const serviceRef = useRef<RealtimeService | null>(null);
  const isMountedRef = useRef(true);

  // Latest callbacks kept in refs so the effects below only re-run when the
  // projection changes — callers commonly pass inline arrow functions.
  // Refs are synced from an effect, never during render (React 19 rules).
  const refreshRef = useRef(refresh);
  const mergeRef = useRef(merge);
  useEffect(() => {
    refreshRef.current = refresh;
    mergeRef.current = merge;
  }, [refresh, merge]);

  /** Pull authoritative rows and replace local state. */
  const loadData = useCallback(async (service: RealtimeService) => {
    try {
      const rows = await refreshRef.current(service);
      if (isMountedRef.current) setData(rows);
    } catch {
      // Keep the rows we already have — realtime deltas will heal the rest.
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  // 1) Create the service once and mirror its connection status.
  useEffect(() => {
    isMountedRef.current = true;
    const service = createRealtimeService();
    serviceRef.current = service;

    // Fires immediately with the current status, then on every change.
    const unsubscribeStatus = service.onStatus((status) => {
      if (isMountedRef.current) setConnectionStatus(status);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribeStatus();
      service.shutdown();
      serviceRef.current = null;
    };
  }, []);

  // 2) Resolve the profile, bind the service to it, and load the first page.
  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      let resolvedId = profileId ?? null;
      if (!resolvedId) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          resolvedId = sessionData.session?.user.id ?? null;
        } catch {
          resolvedId = null;
        }
      }

      if (cancelled) return;
      if (!resolvedId) {
        // Nobody signed in — expose an empty, non-loading state.
        if (isMountedRef.current) setIsLoading(false);
        return;
      }

      // setProfile() notifies the status listener registered in step 1.
      service.setProfile(resolvedId);
      await loadData(service);
    })();

    return () => {
      cancelled = true;
    };
  }, [profileId, loadData]);

  // 3) Stream deltas for this projection.
  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;

    const unsubscribe = service.on(event, (payload) => {
      if (!isMountedRef.current) return;
      const typed = payload as RealtimePayload<T>;
      setData((prev) =>
        mergeRef.current ? mergeRef.current(prev, typed) : defaultMerge(prev, typed)
      );
    });

    return unsubscribe;
  }, [event]);

  const reload = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;
    await loadData(service);
  }, [loadData]);

  return {
    data,
    isLoading,
    reload,
    connectionStatus,
  };
}

export default useRealtimeProjection;

