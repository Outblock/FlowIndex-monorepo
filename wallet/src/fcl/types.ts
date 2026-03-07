export interface FclService {
  f_type: 'Service';
  f_vsn: '1.0.0';
  type: 'authn' | 'authz' | 'user-signature' | 'pre-authz';
  method: 'POP/RPC';
  uid: string;
  endpoint: string;
  id: string;
  identity?: {
    f_type: 'Identity';
    f_vsn: '1.0.0';
    address: string;
    keyId?: number;
  };
  provider?: {
    f_type: 'ServiceProvider';
    address: string;
    name?: string;
    icon?: string;
  };
}

export interface FclAuthnResponse {
  f_type: 'AuthnResponse';
  f_vsn: '1.0.0';
  addr: string;
  services: FclService[];
}

export interface FclCompositeSignature {
  f_type: 'CompositeSignature';
  f_vsn: '1.0.0';
  addr: string;
  keyId: number;
  signature: string;
  extensionData?: string;
}

export interface FclSignable {
  f_type: 'Signable';
  f_vsn: '1.0.1';
  addr: string;
  keyId: number;
  voucher: {
    cadence: string;
    refBlock: string;
    computeLimit: number;
    arguments: unknown[];
    proposalKey: {
      address: string;
      keyId: number;
      sequenceNum: number;
    };
    payer: string;
    authorizers: string[];
    payloadSigs: unknown[];
    envelopeSigs: unknown[];
  };
}
