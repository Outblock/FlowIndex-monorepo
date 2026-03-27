import { create } from 'zustand';

export type RequestType =
  | 'fcl_authn'
  | 'fcl_authz'
  | 'fcl_sign'
  | 'wc_session'
  | 'wc_request';

export interface DappInfo {
  name: string;
  url: string;
  icon?: string;
}

export interface PendingRequest {
  id: string;
  type: RequestType;
  dapp: DappInfo;
  payload: any;
  callback: string;
  chainType: 'cadence' | 'evm';
  method?: string;
  createdAt: number;
}

interface PendingRequestStore {
  requests: Map<string, PendingRequest>;
  add: (request: PendingRequest) => void;
  remove: (id: string) => void;
  get: (id: string) => PendingRequest | undefined;
}

export const usePendingRequests = create<PendingRequestStore>((set, get) => ({
  requests: new Map(),
  add: (request) =>
    set((state) => {
      const next = new Map(state.requests);
      next.set(request.id, request);
      return { requests: next };
    }),
  remove: (id) =>
    set((state) => {
      const next = new Map(state.requests);
      next.delete(id);
      return { requests: next };
    }),
  get: (id) => get().requests.get(id),
}));
