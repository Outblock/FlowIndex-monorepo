import type { FclService, FclAuthnResponse } from './types';

export function buildAuthnResponse(options: {
  address: string;
  keyId: number;
  origin: string;
}): FclAuthnResponse {
  const { address, keyId, origin } = options;
  const addr = address.startsWith('0x') ? address : '0x' + address;

  const services: FclService[] = [
    {
      f_type: 'Service',
      f_vsn: '1.0.0',
      type: 'authn',
      method: 'POP/RPC',
      uid: 'flowindex-wallet#authn',
      endpoint: `${origin}/authn`,
      id: addr,
      identity: {
        f_type: 'Identity',
        f_vsn: '1.0.0',
        address: addr,
        keyId,
      },
      provider: {
        f_type: 'ServiceProvider',
        address: '0x0',
        name: 'FlowIndex Wallet',
        icon: `${origin}/icon.png`,
      },
    },
    {
      f_type: 'Service',
      f_vsn: '1.0.0',
      type: 'authz',
      method: 'POP/RPC',
      uid: 'flowindex-wallet#authz',
      endpoint: `${origin}/authz`,
      id: addr,
      identity: {
        f_type: 'Identity',
        f_vsn: '1.0.0',
        address: addr,
        keyId,
      },
    },
    {
      f_type: 'Service',
      f_vsn: '1.0.0',
      type: 'user-signature',
      method: 'POP/RPC',
      uid: 'flowindex-wallet#user-signature',
      endpoint: `${origin}/sign-message`,
      id: addr,
      identity: {
        f_type: 'Identity',
        f_vsn: '1.0.0',
        address: addr,
        keyId,
      },
    },
  ];

  return {
    f_type: 'AuthnResponse',
    f_vsn: '1.0.0',
    addr,
    services,
  };
}
