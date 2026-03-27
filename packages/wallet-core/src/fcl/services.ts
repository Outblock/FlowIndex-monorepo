import type { FclAuthnResponse, FclService } from './types';

export interface BuildAuthnResponseOptions {
  address: string;
  keyId: number;
  baseUrl: string;
  network?: string;
}

export function buildAuthnResponse(options: BuildAuthnResponseOptions): FclAuthnResponse {
  const { address, keyId, baseUrl, network } = options;
  const addr = address.startsWith('0x') ? address.slice(2) : address;
  const fullAddr = `0x${addr}`;

  const authnService: FclService = {
    f_type: 'Service', f_vsn: '1.0.0', type: 'authn', uid: 'flowindex-wallet#authn',
    method: 'POP/RPC',
    identity: { address: fullAddr, keyId },
    provider: { address: fullAddr, name: 'FlowIndex Wallet', icon: 'https://flowindex.io/logo.png', description: 'FlowIndex non-custodial wallet' },
  };

  const authzService: FclService = {
    f_type: 'Service', f_vsn: '1.0.0', type: 'authz', uid: 'flowindex-wallet#authz',
    method: 'HTTP/POST', endpoint: `${baseUrl}/authz`,
    identity: { address: fullAddr, keyId },
  };

  const userSigService: FclService = {
    f_type: 'Service', f_vsn: '1.0.0', type: 'user-signature', uid: 'flowindex-wallet#user-signature',
    method: 'HTTP/POST', endpoint: `${baseUrl}/sign`,
    identity: { address: fullAddr, keyId },
  };

  return { f_type: 'AuthnResponse', f_vsn: '1.0.0', addr: fullAddr, paddr: null, network, services: [authnService, authzService, userSigService] };
}
