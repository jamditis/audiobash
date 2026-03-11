import { useEffect, useRef, useState } from 'react';
import type { ActivityState } from '../types';

const SILENCE_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 1000;

interface PaneActivity {
  lastOutputTime: number;
  exited: boolean;
  exitCode: number | null;
}

export function deriveState(activity: PaneActivity, now: number): ActivityState {
  if (activity.exited) {
    return activity.exitCode === 0 ? 'done' : 'error';
  }
  if (now - activity.lastOutputTime < SILENCE_TIMEOUT_MS) {
    return 'active';
  }
  return 'silent';
}

export function usePaneActivity(): Map<string, ActivityState> {
  const activitiesRef = useRef<Map<string, PaneActivity>>(new Map());
  const [states, setStates] = useState<Map<string, ActivityState>>(new Map());

  // Listen for terminal output — just update timestamp
  useEffect(() => {
    const cleanup = window.electron.onTerminalData((tabId: string) => {
      const existing = activitiesRef.current.get(tabId);
      if (existing && existing.exited) {
        // Terminal reused after exit — reset state
        activitiesRef.current.set(tabId, {
          lastOutputTime: Date.now(),
          exited: false,
          exitCode: null,
        });
      } else {
        activitiesRef.current.set(tabId, {
          lastOutputTime: Date.now(),
          exited: existing?.exited ?? false,
          exitCode: existing?.exitCode ?? null,
        });
      }
    });
    return cleanup;
  }, []);

  // Listen for terminal close — record exit code
  useEffect(() => {
    const cleanup = window.electron.onTerminalClosed((tabId: string, exitCode: number) => {
      const existing = activitiesRef.current.get(tabId);
      activitiesRef.current.set(tabId, {
        lastOutputTime: existing?.lastOutputTime ?? Date.now(),
        exited: true,
        exitCode,
      });
    });
    return cleanup;
  }, []);

  // Poll every second to derive states from timestamps
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newStates = new Map<string, ActivityState>();
      activitiesRef.current.forEach((activity, tabId) => {
        newStates.set(tabId, deriveState(activity, now));
      });
      setStates(prev => {
        if (prev.size !== newStates.size) return newStates;
        for (const [tabId, state] of newStates) {
          if (prev.get(tabId) !== state) return newStates;
        }
        return prev;
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return states;
}
