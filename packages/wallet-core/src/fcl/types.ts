export interface FclService {
  f_type: 'Service';
  f_vsn: '1.0.0';
  type: 'authn' | 'authz' | 'user-signature' | 'pre-authz' | 'account-proof';
  uid: string;
  method?: 'POP/RPC' | 'HTTP/POST' | 'EXT/RPC';
  endpoint?: string;
  identity?: { address: string; keyId: number };
  provider?: { address: string; name: string; icon?: string; description?: string };
  data?: Record<string, unknown>;
}

export interface FclAuthnResponse {
  f_type: 'AuthnResponse';
  f_vsn: '1.0.0';
  addr: string;
  paddr?: string | null;
  network?: string;
  services: FclService[];
}
