import { useEffect, useState } from 'react';
import type { DashboardData } from './types';

let pending: Promise<DashboardData> | null = null;

/** Fetch dashboard.json once per page load; every route shares the same promise. */
export function loadDashboardData(): Promise<DashboardData> {
  if (!pending) {
    pending = fetch('./data/dashboard.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Data request failed (${response.status})`);
        return response.json() as Promise<DashboardData>;
      })
      .catch((reason: Error) => {
        pending = null; // let the next mount retry after a failed load
        throw reason;
      });
  }
  return pending;
}

export interface DashboardDataState {
  data: DashboardData | null;
  error: string | null;
}

export function useDashboardData(): DashboardDataState {
  const [state, setState] = useState<DashboardDataState>({ data: null, error: null });
  useEffect(() => {
    let active = true;
    loadDashboardData()
      .then((data) => {
        if (active) setState({ data, error: null });
      })
      .catch((reason: Error) => {
        if (active) setState({ data: null, error: reason.message });
      });
    return () => {
      active = false;
    };
  }, []);
  return state;
}
