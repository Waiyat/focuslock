import { supabase } from '../supabase';

/** Connection status of the Supabase Realtime pub/sub socket. */
export type RealtimeConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'failed';

/**
 * Projections the service can stream.
 *
 * `auth` is a local-only stream: Supabase never emits `postgres_changes` for
 * the auth schema, so it is fed from this client's own auth events instead.
 */
export type RealtimeEventMap =
  | 'limits'
  | 'resetWindow'
  | 'profile'
  | 'usageSnapshots'
  | 'auth';

export interface RealtimePayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: T;
  old?: T;
  diff?: Partial<T>;
  schema: string;
  table: string;
  commit_timestamp: string;
}

/** Stable channel names for the profile-scoped realtime streams. */
export const REALTIME_CHANNELS = {
  limits: (profileId: string) => `realtime-limits-${profileId}`,
  resetWindow: (profileId: string) => `realtime-reset-window-${profileId}`,
  profile: (profileId: string) => `realtime-profile-${profileId}`,
  usageSnapshots: (profileId: string) => `realtime-usage-snapshots-${profileId}`,
  auth: (profileId: string) => `realtime-auth-${profileId}`,
} as const;

type ChannelHandle = { unsubscribe: () => void };
type RealtimeListener = (payload: RealtimePayload<unknown>) => void;
type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Realtime service — manages the Supabase Realtime connection, channel
 * subscriptions, and delivers typed, debounced snapshots to the caller.
 *
 * Design: pull + push. The client pulls authoritative rows with `refresh()`,
 * and the realtime channels deliver deltas that the client merges. On
 * disconnect/recreate the next `refresh()` heals the state.
 *
 * Channels are attached lazily: a projection only gets a channel once at
 * least one listener subscribes via `on()`, and it is detached again when the
 * last listener leaves. That keeps a screen consuming a single projection
 * from opening four duplicate subscriptions.
 */
export class RealtimeService {
  private profileId: string | null = null;

  // Channel handles keyed by projection (only projections with listeners)
  private channels = new Map<RealtimeEventMap, ChannelHandle>();

  // Event listeners keyed by projection
  private listeners = new Map<RealtimeEventMap, Set<RealtimeListener>>();

  // Per-channel status + aggregate status exposed to consumers
  private channelStatuses = new Map<RealtimeEventMap, RealtimeConnectionStatus>();
  private status: RealtimeConnectionStatus = 'disconnected';
  private statusListeners = new Set<(status: RealtimeConnectionStatus) => void>();

  // Auth listener handle — released on shutdown() so instances don't leak
  private authSubscription: { unsubscribe: () => void } | null = null;

  // Debounce for batched realtime updates
  private pendingEvents = new Map<RealtimeEventMap, RealtimePayload<unknown>[]>();
  private flushTimers = new Map<RealtimeEventMap, ReturnType<typeof setTimeout>>();
  private readonly DEBOUNCE_MS = 60;

  constructor() {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      // Local-only signal for `auth` listeners — delivered synchronously
      // because cleanup() below drops every queued batch.
      this.deliver('auth', {
        eventType: 'DELETE',
        schema: 'public',
        table: 'auth',
        commit_timestamp: new Date().toISOString(),
      });
      this.profileId = null;
      this.cleanup();
    });
    this.authSubscription = data.subscription;
  }

  /** Set the active profile id and (re)establish subscriptions for every projection that has listeners. */
  setProfile(profileId: string): void {
    if (this.profileId === profileId) return;
    this.profileId = profileId;
    this.cleanup();
    this.attachListeners();
  }

  /** Return the current aggregate connection status. */
  getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  /** Returns whether at least one channel is currently attached. */
  hasActiveSubscription(): boolean {
    return this.channels.size > 0;
  }

  /** Subscribe a listener for a given realtime projection. Returns an unsubscribe function. */
  on<K extends RealtimeEventMap>(event: K, listener: RealtimeListener): () => void {
    const set = this.listeners.get(event) ?? new Set<RealtimeListener>();
    set.add(listener);
    this.listeners.set(event, set);

    // Lazily attach the underlying channel now that someone is listening.
    if (this.profileId && event !== 'auth' && !this.channels.has(event)) {
      this.attachFor(event);
      this.recomputeStatus();
    }

    return () => {
      const listeners = this.listeners.get(event);
      if (!listeners) return;
      listeners.delete(listener);
      if (listeners.size > 0) return;
      this.listeners.delete(event);

      // Last listener for this projection went away — free the channel.
      const handle = this.channels.get(event);
      if (handle) {
        this.channels.delete(event);
        this.channelStatuses.delete(event);
        handle.unsubscribe();
        this.recomputeStatus();
      }
    };
  }

  /** Subscribe to aggregate connection-status changes. Fires immediately with the current status. */
  onStatus(listener: (status: RealtimeConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    try {
      listener(this.status);
    } catch {
      // Never let a listener crash the subscription.
    }
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Attach channels for every projection that currently has listeners. */
  private attachListeners(): void {
    if (!this.profileId) return;
    for (const event of Array.from(this.listeners.keys())) {
      if (event === 'auth' || this.channels.has(event)) continue;
      this.attachFor(event);
    }
    this.recomputeStatus();
  }

  /** Attach the channel for a single projection. */
  private attachFor(event: RealtimeEventMap): void {
    const profileId = this.profileId;
    if (!profileId) return;

    switch (event) {
      case 'limits':
        this.channels.set(event, this.attachChannel(event, 'app_limits', `user_id=eq.${profileId}`));
        break;
      case 'resetWindow':
        this.channels.set(event, this.attachChannel(event, 'reset_windows', `user_id=eq.${profileId}`));
        break;
      case 'profile':
        this.channels.set(event, this.attachChannel(event, 'profiles', `id=eq.${profileId}`, ['UPDATE']));
        break;
      case 'usageSnapshots':
        this.channels.set(event, this.attachChannel(event, 'usage_snapshots', `user_id=eq.${profileId}`));
        break;
      case 'auth':
        // Local-only stream — there is no postgres channel to attach.
        break;
    }
  }

  /** Attach a postgres_changes channel for one projection. */
  private attachChannel(
    event: RealtimeEventMap,
    table: string,
    filter: string,
    events: ChangeEvent[] = ['INSERT', 'UPDATE', 'DELETE']
  ): ChannelHandle {
    const channel = supabase.channel(this.channelName(event));
    this.channelStatuses.set(event, 'connecting');

    // One binding per event type: supabase expects a single event string per
    // `.on()` registration — never an array (which it silently rejects).
    for (const eventType of events) {
      channel.on(
        'postgres_changes',
        { event: eventType, schema: 'public', table, filter },
        (payload) => {
          this.enqueue(event, payload as RealtimePayload<unknown>);
        }
      );
    }

    // Ignore callbacks from channels that have already been detached.
    let active = true;
    channel.subscribe((status: string) => {
      if (!active) return;
      switch (status) {
        case 'SUBSCRIBED':
          this.channelStatuses.set(event, 'connected');
          break;
        case 'TIMED_OUT':
        case 'CHANNEL_ERROR':
          this.channelStatuses.set(event, 'failed');
          break;
        case 'CLOSED':
        default:
          this.channelStatuses.set(event, 'closed');
          break;
      }
      this.recomputeStatus();
    });

    return {
      unsubscribe: () => {
        active = false;
        channel.unsubscribe().catch(() => {
          // Channel was already gone — nothing left to clean up.
        });
      },
    };
  }

  /** Publish a status change to every status listener. */
  private setStatus(next: RealtimeConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of Array.from(this.statusListeners)) {
      try {
        listener(next);
      } catch {
        // Never let a listener crash the delivery loop.
      }
    }
  }

  /** Derive the aggregate status from the per-channel statuses. */
  private recomputeStatus(): void {
    const statuses = Array.from(this.channelStatuses.values());
    if (statuses.length === 0) {
      this.setStatus('disconnected');
      return;
    }
    if (statuses.includes('connected')) this.setStatus('connected');
    else if (statuses.includes('connecting')) this.setStatus('connecting');
    else if (statuses.includes('failed')) this.setStatus('failed');
    else this.setStatus('closed');
  }

  /** Enqueue a realtime delta for batched delivery. */
  private enqueue(event: RealtimeEventMap, payload: RealtimePayload<unknown>): void {
    const batch = this.pendingEvents.get(event) ?? [];
    batch.push(payload);
    this.pendingEvents.set(event, batch);

    const existing = this.flushTimers.get(event);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.flush(event);
    }, this.DEBOUNCE_MS);
    this.flushTimers.set(event, timer);
  }

  /** Flush every queued delta for one projection, in arrival order. */
  private flush(event: RealtimeEventMap): void {
    const batch = this.pendingEvents.get(event);
    this.pendingEvents.delete(event);
    this.flushTimers.delete(event);
    if (!batch) return;
    for (const payload of batch) {
      this.deliver(event, payload);
    }
  }

  /** Deliver one payload to every listener of a projection. */
  private deliver(event: RealtimeEventMap, payload: RealtimePayload<unknown>): void {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.size === 0) return;
    for (const listener of Array.from(listeners)) {
      try {
        listener(payload);
      } catch {
        // Never let a listener crash the delivery loop.
      }
    }
  }

  /**
   * Pull authoritative rows for the active profile.
   *
   * @param table   Table to read (e.g. `app_limits`).
   * @param column  Column holding the profile id — `user_id` by default, or
   *                `id` for tables keyed by the profile itself (`profiles`).
   * @param orderBy Column to sort by; defaults to `created_at`.
   */
  async refresh<T = Record<string, unknown>>(
    table: string,
    column = 'user_id',
    orderBy?: string
  ): Promise<T[]> {
    const { profileId } = this;
    if (!profileId) return [];

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, profileId)
      .order(orderBy ?? 'created_at', { ascending: true });

    if (error) {
      console.warn(`[RealtimeService][refresh ${table}]`, error.message);
      return [];
    }

    return (data ?? []) as T[];
  }

  /** Get the channel name for an event type. */
  private channelName(event: RealtimeEventMap): string {
    const profileId = this.profileId ?? '';
    switch (event) {
      case 'limits':
        return REALTIME_CHANNELS.limits(profileId);
      case 'resetWindow':
        return REALTIME_CHANNELS.resetWindow(profileId);
      case 'profile':
        return REALTIME_CHANNELS.profile(profileId);
      case 'usageSnapshots':
        return REALTIME_CHANNELS.usageSnapshots(profileId);
      case 'auth':
        return REALTIME_CHANNELS.auth(profileId);
    }
  }

  /**
   * Tear down every channel and drop queued batches. Listeners are kept so
   * the service stays reusable (e.g. after a profile switch or a re-login).
   */
  cleanup(): void {
    const handles = Array.from(this.channels.values());
    this.channels.clear();
    this.channelStatuses.clear();
    for (const handle of handles) {
      try {
        handle.unsubscribe();
      } catch {
        /* noop */
      }
    }

    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    this.flushTimers.clear();
    this.pendingEvents.clear();
    this.setStatus('closed');
  }

  /** Graceful shutdown — releases the auth listener and every subscriber. */
  shutdown(): void {
    this.cleanup();
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
    this.listeners.clear();
    this.statusListeners.clear();
  }
}

/**
 * Create an independent service instance. Each instance owns its own
 * channels, so a screen that unmounts can `shutdown()` without disturbing
 * other consumers.
 */
export function createRealtimeService(): RealtimeService {
  return new RealtimeService();
}
