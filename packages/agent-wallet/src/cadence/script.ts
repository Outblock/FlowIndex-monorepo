import * as fcl from '@onflow/fcl';
import { buildFclArgs, type CadenceArgument } from './arguments.js';

export async function executeCadenceScript(
  cadence: string,
  argumentsList: CadenceArgument[] = [],
): Promise<unknown> {
  const config = {
    cadence: cadence.trim(),
    limit: 9999,
  };

  if (argumentsList.length > 0) {
    Object.assign(config, {
      args: buildFclArgs(argumentsList),
    });
  }

  return fcl.query(config as never);
}
