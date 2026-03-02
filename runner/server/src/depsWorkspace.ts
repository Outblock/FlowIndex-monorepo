import { execFile } from 'node:child_process';
import { writeFile, readFile, access, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hasAddressImports, rewriteToStringImports } from './importUtils.js';

export type FlowNetwork = 'mainnet' | 'testnet' | 'emulator';

/**
 * Persistent workspace that caches installed dependencies per network.
 * Uses `flow dependencies install` to fetch contracts from mainnet/testnet.
 */
export class DepsWorkspace {
  private dir: string;
  private flowCommand: string;
  private network: FlowNetwork;
  private installedContracts = new Set<string>();
  private installingContracts = new Map<string, Promise<void>>();
  private rewrittenOnce = false;
  private rewritePromise: Promise<void> | null = null;

  constructor(flowCommand: string, network: FlowNetwork) {
    this.flowCommand = flowCommand;
    this.network = network;
    this.dir = join(tmpdir(), `cadence-lsp-deps-${network}`);
  }

  getDir(): string {
    return this.dir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const flowJsonPath = join(this.dir, 'flow.json');
    try {
      await access(flowJsonPath);
      // flow.json exists — recover previously installed deps
      const raw = await readFile(flowJsonPath, 'utf-8');
      const config = JSON.parse(raw);
      if (config.dependencies) {
        for (const name of Object.keys(config.dependencies)) {
          this.installedContracts.add(name);
        }
      }
    } catch {
      // Create fresh flow.json with network config
      await writeFile(flowJsonPath, JSON.stringify({
        networks: {
          mainnet: 'access.mainnet.nodes.onflow.org:9000',
          testnet: 'access.devnet.nodes.onflow.org:9000',
          emulator: '127.0.0.1:3569',
        },
      }, null, 2), 'utf-8');
    }
  }

  /** Install dependencies for contracts not yet cached */
  async installDeps(imports: { name: string; address: string }[]): Promise<void> {
    const installs = imports.map((dep) => this.ensureDepInstalled(dep));
    await Promise.all(installs);

    // Ensure existing cached deps (from older runs) also get rewritten once.
    await this.ensureImportsRewrittenOnce();
  }

  private ensureDepInstalled(dep: { name: string; address: string }): Promise<void> {
    if (this.installedContracts.has(dep.name)) {
      return Promise.resolve();
    }

    const inFlight = this.installingContracts.get(dep.name);
    if (inFlight) {
      return inFlight;
    }

    const depSpec = `${this.network}://0x${dep.address}.${dep.name}`;
    const installPromise = new Promise<void>((resolve) => {
      execFile(
        this.flowCommand,
        ['dependencies', 'install', depSpec],
        { cwd: this.dir, timeout: 120000 },
        (error, _stdout, stderr) => {
          if (!error) {
            this.installedContracts.add(dep.name);
          } else {
            console.error(`[deps] Failed to install ${dep.name}: ${stderr}`);
          }
          resolve();
        },
      );
    }).finally(() => {
      this.installingContracts.delete(dep.name);
    });

    this.installingContracts.set(dep.name, installPromise);
    return installPromise;
  }

  private async ensureImportsRewrittenOnce(): Promise<void> {
    if (this.rewrittenOnce) return;
    if (!this.rewritePromise) {
      this.rewritePromise = this.rewriteInstalledAddressImports()
        .catch((error) => {
          console.error('[deps] Failed to rewrite installed imports:', error);
        })
        .finally(() => {
          this.rewrittenOnce = true;
          this.rewritePromise = null;
        });
    }
    await this.rewritePromise;
  }

  async getDependencyCode(address: string, contractName: string): Promise<string | null> {
    const noPrefix = address.replace(/^0x/i, '').toLowerCase();
    const candidates = [
      noPrefix,
      `0x${noPrefix}`,
    ];

    for (const dirName of candidates) {
      const depPath = join(this.dir, 'imports', dirName, `${contractName}.cdc`);
      try {
        return await readFile(depPath, 'utf-8');
      } catch {
        // Try next candidate path.
      }
    }

    return null;
  }

  private async rewriteInstalledAddressImports(): Promise<void> {
    const files = await this.collectCadenceFiles(this.dir);
    for (const filePath of files) {
      try {
        const source = await readFile(filePath, 'utf-8');
        if (!hasAddressImports(source)) continue;
        const rewritten = rewriteToStringImports(source);
        if (rewritten !== source) {
          await writeFile(filePath, rewritten, 'utf-8');
        }
      } catch (error) {
        console.error(`[deps] Failed to rewrite imports in ${filePath}:`, error);
      }
    }
  }

  private async collectCadenceFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.collectCadenceFiles(fullPath));
        continue;
      }
      if (entry.isFile() && fullPath.endsWith('.cdc')) {
        files.push(fullPath);
      }
    }

    return files;
  }
}
