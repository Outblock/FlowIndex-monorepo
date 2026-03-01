import * as fcl from '@onflow/fcl';
import { NETWORK_CONFIG, type FlowNetwork } from './networks';

export function configureFcl(network: FlowNetwork) {
  const config = NETWORK_CONFIG[network];
  Object.entries(config).forEach(([key, value]) => {
    fcl.config().put(key, value);
  });
}

export { fcl };
