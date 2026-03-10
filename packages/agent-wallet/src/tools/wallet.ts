import { z } from 'zod';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from '../server/server.js';
import { LocalSigner } from '../signer/local.js';
import { NETWORK_CONFIG } from '../config/networks.js';

/** Go API envelope: { data: {...}, error: {...} } */
interface ApiEnvelope<T> {
  data?: T;
  error?: { message: string };
}

export function registerWalletTools(server: McpServer, ctx: ServerContext): void {
  // --------------------------------------------------------------------------
  // wallet_status — read-only, returns signer info
  // --------------------------------------------------------------------------
  server.registerTool(
    "wallet_status",
    {
      title: "Wallet Status",
      description:
        "Returns the current wallet configuration: signer type, Flow address, EVM address, key index, algorithms, network, and approval mode.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const info = ctx.signer.info();
        const result = {
          signer_type: info.type,
          flow_address: info.flowAddress || null,
          evm_address: info.evmAddress || null,
          key_index: info.keyIndex,
          sig_algo: info.sigAlgo,
          hash_algo: info.hashAlgo,
          network: ctx.config.network,
          approval_required: ctx.config.approvalRequired,
          headless: ctx.signer.isHeadless(),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --------------------------------------------------------------------------
  // wallet_login — initiate cloud-interactive login flow
  // --------------------------------------------------------------------------
  server.registerTool(
    "wallet_login",
    {
      title: "Wallet Login",
      description:
        "Initiates an interactive login flow for cloud wallet. Returns a login URL that the user must visit to authenticate. Only needed for cloud-interactive signer type.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const resp = await fetch(
          `${ctx.config.flowindexUrl}/api/v1/wallet/agent/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!resp.ok) {
          const body = await resp.text();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: `Login request failed (${resp.status}): ${body}` },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const envelope = (await resp.json()) as ApiEnvelope<{
          session_id: string;
          login_url: string;
          expires_in: number;
        }>;

        if (envelope.error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: envelope.error.message },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const data = envelope.data!;
        const result = {
          status: "pending",
          login_url: data.login_url,
          session_id: data.session_id,
          message:
            "Please open the login URL in a browser to authenticate. Then call wallet_login_status with the session_id to complete login.",
          expires_in: data.expires_in,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --------------------------------------------------------------------------
  // wallet_login_status — check login status and finalize auth
  // --------------------------------------------------------------------------
  server.registerTool(
    "wallet_login_status",
    {
      title: "Wallet Login Status",
      description:
        "Checks the status of an interactive login session. If authenticated, activates the cloud signer with the received token.",
      inputSchema: {
        session_id: z.string().describe("The session_id returned by wallet_login"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ session_id }: { session_id: string }) => {
      try {
        const resp = await fetch(
          `${ctx.config.flowindexUrl}/api/v1/wallet/agent/login/${encodeURIComponent(session_id)}`
        );

        if (!resp.ok) {
          const body = await resp.text();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: `Status check failed (${resp.status}): ${body}`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const envelope = (await resp.json()) as ApiEnvelope<{
          status: string;
          token?: string;
        }>;

        if (envelope.error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: envelope.error.message },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const data = envelope.data!;

        if (data.status === 'completed' && data.token) {
          // Activate the cloud signer with the received token
          ctx.cloudSigner.setToken(data.token);
          await ctx.cloudSigner.init();

          // If using cloud-interactive, swap the active signer
          if (ctx.config.signerType === 'cloud-interactive') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ctx as any).signer = ctx.cloudSigner;
          }

          const info = ctx.cloudSigner.info();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    status: "authenticated",
                    flow_address: info.flowAddress,
                    evm_address: info.evmAddress,
                    key_index: info.keyIndex,
                    message: "Login successful. Wallet is now active.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Not yet authenticated
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: data.status || "pending",
                  authenticated: false,
                  message:
                    "Login not yet completed. Please visit the login URL and try again.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --------------------------------------------------------------------------
  // diagnose_signing — deep check of key/account match
  // --------------------------------------------------------------------------
  server.registerTool(
    "diagnose_signing",
    {
      title: "Diagnose Signing",
      description:
        "Runs a comprehensive diagnostic on the signing setup: verifies the configured private key matches the on-chain account key, checks sigAlgo/hashAlgo, weight, and performs a local sign+verify test. Use this to debug 'invalid signature' errors.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const checks: Array<{ check: string; status: 'pass' | 'fail' | 'warn' | 'skip'; detail: string }> = [];
      const info = ctx.signer.info();

      // 1. Basic info
      checks.push({
        check: 'signer_type',
        status: 'pass',
        detail: `Type: ${info.type}, Address: ${info.flowAddress ?? 'none'}, KeyIndex: ${info.keyIndex}, SigAlgo: ${info.sigAlgo}, HashAlgo: ${info.hashAlgo}`,
      });

      // 2. Get local public key (only for LocalSigner)
      let localPubKey: string | null = null;
      if (ctx.signer instanceof LocalSigner) {
        localPubKey = ctx.signer.getFlowPublicKey();
        checks.push({
          check: 'local_public_key',
          status: localPubKey ? 'pass' : 'fail',
          detail: localPubKey ? `${localPubKey.slice(0, 16)}...${localPubKey.slice(-16)} (${localPubKey.length} hex chars)` : 'No public key derived',
        });
      } else {
        checks.push({
          check: 'local_public_key',
          status: 'skip',
          detail: `Skipped — signer is ${info.type}, not local`,
        });
      }

      // 3. Fetch on-chain account keys
      if (!info.flowAddress) {
        checks.push({
          check: 'onchain_key_match',
          status: 'fail',
          detail: 'No Flow address configured — cannot verify on-chain key',
        });
      } else {
        try {
          const accessNode = NETWORK_CONFIG[ctx.config.network].accessNode;
          const addr = info.flowAddress.replace(/^0x/, '');
          const resp = await fetch(`${accessNode}/v1/accounts/${addr}?expand=keys`);

          if (!resp.ok) {
            checks.push({
              check: 'onchain_key_fetch',
              status: 'fail',
              detail: `Flow Access API returned ${resp.status}: ${await resp.text()}`,
            });
          } else {
            const account = (await resp.json()) as {
              address: string;
              keys: Array<{
                index: string;
                public_key: string;
                signing_algorithm: string;
                hashing_algorithm: string;
                weight: string;
                revoked: boolean;
              }>;
            };

            const targetKey = account.keys?.find(
              (k) => String(k.index) === String(info.keyIndex),
            );

            if (!targetKey) {
              checks.push({
                check: 'onchain_key_match',
                status: 'fail',
                detail: `Key index ${info.keyIndex} not found on account ${info.flowAddress}. Available indices: ${account.keys?.map((k) => k.index).join(', ') ?? 'none'}`,
              });
            } else {
              // Check revoked
              if (targetKey.revoked) {
                checks.push({
                  check: 'key_revoked',
                  status: 'fail',
                  detail: `Key index ${info.keyIndex} is REVOKED on-chain`,
                });
              }

              // Check weight
              const weight = parseInt(targetKey.weight, 10);
              checks.push({
                check: 'key_weight',
                status: weight >= 1000 ? 'pass' : 'fail',
                detail: `Weight: ${weight} (need >= 1000 for full signing authority)`,
              });

              // Map Flow REST API algo names to our names
              const onchainSigAlgo = targetKey.signing_algorithm; // e.g. "ECDSA_secp256k1"
              const onchainHashAlgo = targetKey.hashing_algorithm; // e.g. "SHA2_256"

              // Check sigAlgo match
              const sigMatch = info.sigAlgo === onchainSigAlgo;
              checks.push({
                check: 'sig_algo_match',
                status: sigMatch ? 'pass' : 'fail',
                detail: sigMatch
                  ? `Both: ${info.sigAlgo}`
                  : `MISMATCH — config: ${info.sigAlgo}, on-chain: ${onchainSigAlgo}`,
              });

              // Check hashAlgo match
              const hashMatch = info.hashAlgo === onchainHashAlgo;
              checks.push({
                check: 'hash_algo_match',
                status: hashMatch ? 'pass' : 'fail',
                detail: hashMatch
                  ? `Both: ${info.hashAlgo}`
                  : `MISMATCH — config: ${info.hashAlgo}, on-chain: ${onchainHashAlgo}`,
              });

              // Check public key match
              if (localPubKey) {
                const onchainPubKey = targetKey.public_key.replace(/^0x/, '').toLowerCase();
                const localPubKeyClean = localPubKey.toLowerCase();
                const pubKeyMatch = localPubKeyClean === onchainPubKey;
                checks.push({
                  check: 'public_key_match',
                  status: pubKeyMatch ? 'pass' : 'fail',
                  detail: pubKeyMatch
                    ? `Keys match (${localPubKeyClean.slice(0, 16)}...)`
                    : `MISMATCH\n  local:   ${localPubKeyClean.slice(0, 32)}...\n  onchain: ${onchainPubKey.slice(0, 32)}...`,
                });
              }
            }
          }
        } catch (error) {
          checks.push({
            check: 'onchain_key_fetch',
            status: 'fail',
            detail: `Error fetching account: ${String(error)}`,
          });
        }
      }

      // 4. Local sign+verify test
      if (ctx.signer instanceof LocalSigner && localPubKey) {
        try {
          const testMessage = 'deadbeef01020304';
          const result = await ctx.signer.signFlowTransaction(testMessage);

          if (result.signature && result.signature.length === 128) {
            checks.push({
              check: 'local_sign_verify',
              status: 'pass',
              detail: `Signature produced: ${result.signature.slice(0, 16)}... (128 hex chars, correct format)`,
            });
          } else {
            checks.push({
              check: 'local_sign_verify',
              status: 'fail',
              detail: `Unexpected signature format: length=${result.signature?.length}, expected 128`,
            });
          }
        } catch (error) {
          checks.push({
            check: 'local_sign_verify',
            status: 'fail',
            detail: `Signing failed: ${String(error)}`,
          });
        }
      }

      // Summary
      const failCount = checks.filter((c) => c.status === 'fail').length;
      const summary = failCount === 0
        ? 'All checks passed — signing setup looks correct.'
        : `${failCount} check(s) FAILED — see details above for the root cause.`;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ summary, checks }, null, 2),
        }],
        ...(failCount > 0 ? { isError: true } : {}),
      };
    },
  );
}
