/** Virtual file system for multi-file Cadence projects.
 * Stores files in localStorage, keyed by project name. */

export interface FileEntry {
  path: string;        // e.g. "main.cdc", "contracts/MyToken.cdc"
  content: string;
  readOnly?: boolean;  // true for dependency files
  language?: string;   // default: 'cadence'
}

export interface ProjectState {
  files: FileEntry[];
  activeFile: string;
  openFiles: string[];
}

const STORAGE_KEY = 'runner:project';

const DEFAULT_CODE = `// Welcome to Cadence Runner
// Press Ctrl/Cmd+Enter to execute

access(all) fun main(): String {
    return "Hello, Flow!"
}
`;

export interface Template {
  label: string;
  description: string;
  icon: string;
  files: FileEntry[];
  activeFile: string;
}

export const TEMPLATES: Template[] = [
  {
    label: 'Hello World',
    description: 'Simple script that returns a string',
    icon: 'wave',
    files: [{ path: 'main.cdc', content: DEFAULT_CODE }],
    activeFile: 'main.cdc',
  },
  {
    label: 'Query Account Balance',
    description: 'Check FLOW balance of any address',
    icon: 'search',
    files: [{
      path: 'main.cdc',
      content: `import FungibleToken from 0xf233dcee88fe0abe
import FlowToken from 0x1654653399040a61

access(all) fun main(address: Address): UFix64 {
    let account = getAccount(address)
    let vaultRef = account.capabilities
        .borrow<&{FungibleToken.Balance}>(/public/flowTokenBalance)
        ?? panic("Could not borrow Balance capability")
    return vaultRef.balance
}
`,
    }],
    activeFile: 'main.cdc',
  },
  {
    label: 'Query NFT Collection',
    description: 'List NFT IDs in a collection',
    icon: 'image',
    files: [{
      path: 'main.cdc',
      content: `import NonFungibleToken from 0x1d7e57aa55817448

access(all) fun main(address: Address, storagePath: String): [UInt64] {
    let account = getAuthAccount<auth(Storage) &Account>(address)
    let path = StoragePath(identifier: storagePath)
        ?? panic("Invalid storage path")
    if let collection = account.storage.borrow<&{NonFungibleToken.Collection}>(from: path) {
        return collection.getIDs()
    }
    return []
}
`,
    }],
    activeFile: 'main.cdc',
  },
  {
    label: 'Create Fungible Token',
    description: 'Define a basic FT contract',
    icon: 'coins',
    files: [{
      path: 'MyToken.cdc',
      content: `import FungibleToken from 0xf233dcee88fe0abe

access(all) contract MyToken: FungibleToken {

    access(all) var totalSupply: UFix64

    access(all) entitlement Withdraw

    access(all) resource Vault: FungibleToken.Vault {
        access(all) var balance: UFix64

        init(balance: UFix64) {
            self.balance = balance
        }

        access(FungibleToken.Withdraw) fun withdraw(amount: UFix64): @{FungibleToken.Vault} {
            self.balance = self.balance - amount
            return <- create Vault(balance: amount)
        }

        access(all) fun deposit(from: @{FungibleToken.Vault}) {
            let vault <- from as! @MyToken.Vault
            self.balance = self.balance + vault.balance
            vault.balance = 0.0
            destroy vault
        }

        access(all) fun createEmptyVault(): @{FungibleToken.Vault} {
            return <- create Vault(balance: 0.0)
        }

        access(all) view fun isAvailableToWithdraw(amount: UFix64): Bool {
            return self.balance >= amount
        }
    }

    access(all) fun createEmptyVault(vaultType: Type): @{FungibleToken.Vault} {
        return <- create Vault(balance: 0.0)
    }

    init() {
        self.totalSupply = 1000000.0
    }
}
`,
    }],
    activeFile: 'MyToken.cdc',
  },
  {
    label: 'Create NFT Collection',
    description: 'Define a basic NFT contract',
    icon: 'image-plus',
    files: [{
      path: 'MyNFT.cdc',
      content: `import NonFungibleToken from 0x1d7e57aa55817448
import MetadataViews from 0x1d7e57aa55817448

access(all) contract MyNFT: NonFungibleToken {

    access(all) var totalSupply: UInt64

    access(all) event ContractInitialized()
    access(all) event Withdraw(id: UInt64, from: Address?)
    access(all) event Deposit(id: UInt64, to: Address?)

    access(all) resource NFT: NonFungibleToken.NFT {
        access(all) let id: UInt64
        access(all) let name: String
        access(all) let description: String
        access(all) let thumbnail: String

        init(name: String, description: String, thumbnail: String) {
            self.id = MyNFT.totalSupply
            self.name = name
            self.description = description
            self.thumbnail = thumbnail
            MyNFT.totalSupply = MyNFT.totalSupply + 1
        }

        access(all) fun createEmptyCollection(): @{NonFungibleToken.Collection} {
            return <- MyNFT.createEmptyCollection(nftType: Type<@MyNFT.NFT>())
        }

        access(all) view fun getViews(): [Type] {
            return [Type<MetadataViews.Display>()]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<MetadataViews.Display>():
                    return MetadataViews.Display(
                        name: self.name,
                        description: self.description,
                        thumbnail: MetadataViews.HTTPFile(url: self.thumbnail)
                    )
            }
            return nil
        }
    }

    access(all) resource Collection: NonFungibleToken.Collection {
        access(all) var ownedNFTs: @{UInt64: {NonFungibleToken.NFT}}

        init() {
            self.ownedNFTs <- {}
        }

        access(all) view fun getIDs(): [UInt64] {
            return self.ownedNFTs.keys
        }

        access(all) view fun borrowNFT(_ id: UInt64): &{NonFungibleToken.NFT}? {
            return &self.ownedNFTs[id]
        }

        access(NonFungibleToken.Withdraw) fun withdraw(withdrawID: UInt64): @{NonFungibleToken.NFT} {
            let token <- self.ownedNFTs.remove(key: withdrawID)
                ?? panic("NFT not found in collection")
            return <- token
        }

        access(all) fun deposit(token: @{NonFungibleToken.NFT}) {
            let nft <- token as! @MyNFT.NFT
            self.ownedNFTs[nft.id] <-! nft
        }

        access(all) fun createEmptyCollection(): @{NonFungibleToken.Collection} {
            return <- create Collection()
        }

        access(all) view fun getSupportedNFTTypes(): {Type: Bool} {
            return { Type<@MyNFT.NFT>(): true }
        }

        access(all) view fun isSupportedNFTType(type: Type): Bool {
            return type == Type<@MyNFT.NFT>()
        }
    }

    access(all) fun createEmptyCollection(nftType: Type): @{NonFungibleToken.Collection} {
        return <- create Collection()
    }

    init() {
        self.totalSupply = 0
        emit ContractInitialized()
    }
}
`,
    }],
    activeFile: 'MyNFT.cdc',
  },
  {
    label: 'Send FLOW Transaction',
    description: 'Transfer FLOW tokens to another address',
    icon: 'send',
    files: [{
      path: 'main.cdc',
      content: `import FungibleToken from 0xf233dcee88fe0abe
import FlowToken from 0x1654653399040a61

transaction(amount: UFix64, recipient: Address) {

    let sentVault: @{FungibleToken.Vault}

    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage
            .borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow reference to the owner's Vault")
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }

    execute {
        let receiverRef = getAccount(recipient)
            .capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow receiver reference")
        receiverRef.deposit(from: <- self.sentVault)
    }
}
`,
    }],
    activeFile: 'main.cdc',
  },
];

function defaultProject(): ProjectState {
  return {
    files: [{ path: 'main.cdc', content: DEFAULT_CODE }],
    activeFile: 'main.cdc',
    openFiles: ['main.cdc'],
  };
}

export function loadProject(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectState;
      if (parsed.files && parsed.files.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return defaultProject();
}

export function saveProject(state: ProjectState) {
  // Only save non-readOnly files (deps are resolved on demand)
  const toSave: ProjectState = {
    ...state,
    files: state.files.filter((f) => !f.readOnly),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch { /* quota exceeded, ignore */ }
}

export function getFileContent(state: ProjectState, path: string): string | undefined {
  return state.files.find((f) => f.path === path)?.content;
}

export function updateFileContent(state: ProjectState, path: string, content: string): ProjectState {
  return {
    ...state,
    files: state.files.map((f) => (f.path === path ? { ...f, content } : f)),
  };
}

export function createFile(state: ProjectState, path: string, content = ''): ProjectState {
  if (state.files.some((f) => f.path === path)) return state;
  return {
    ...state,
    files: [...state.files, { path, content }],
    openFiles: [...state.openFiles, path],
    activeFile: path,
  };
}

export function deleteFile(state: ProjectState, path: string): ProjectState {
  const files = state.files.filter((f) => f.path !== path);
  const openFiles = state.openFiles.filter((f) => f !== path);
  let activeFile = state.activeFile;
  if (activeFile === path) {
    activeFile = openFiles[0] || files[0]?.path || '';
  }
  return { files, openFiles, activeFile };
}

export function renameFile(state: ProjectState, oldPath: string, newPath: string): ProjectState {
  if (state.files.some((f) => f.path === newPath)) return state;
  return {
    ...state,
    files: state.files.map((f) => (f.path === oldPath ? { ...f, path: newPath } : f)),
    openFiles: state.openFiles.map((f) => (f === oldPath ? newPath : f)),
    activeFile: state.activeFile === oldPath ? newPath : state.activeFile,
  };
}

export function openFile(state: ProjectState, path: string): ProjectState {
  const openFiles = state.openFiles.includes(path) ? state.openFiles : [...state.openFiles, path];
  return { ...state, openFiles, activeFile: path };
}

export function closeFile(state: ProjectState, path: string): ProjectState {
  const openFiles = state.openFiles.filter((f) => f !== path);
  let activeFile = state.activeFile;
  if (activeFile === path) {
    const idx = state.openFiles.indexOf(path);
    activeFile = openFiles[Math.min(idx, openFiles.length - 1)] || '';
  }
  return { ...state, openFiles, activeFile };
}

/** Add a resolved dependency file (read-only, in deps/ folder) */
export function addDependencyFile(state: ProjectState, address: string, contractName: string, code: string): ProjectState {
  const path = `deps/${address}/${contractName}.cdc`;
  const existing = state.files.find((f) => f.path === path);
  if (existing) {
    // Update content if changed
    if (existing.content === code) return state;
    return {
      ...state,
      files: state.files.map((f) => (f.path === path ? { ...f, content: code } : f)),
    };
  }
  return {
    ...state,
    files: [...state.files, { path, content: code, readOnly: true }],
  };
}

/** Get all user files (non-dependency) */
export function getUserFiles(state: ProjectState): FileEntry[] {
  return state.files.filter((f) => !f.readOnly && !f.path.startsWith('deps/'));
}

/** Get all dependency files */
export function getDependencyFiles(state: ProjectState): FileEntry[] {
  return state.files.filter((f) => f.readOnly || f.path.startsWith('deps/'));
}

/** Build a folder tree structure from flat file list */
export interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  readOnly?: boolean;
  children: TreeNode[];
}

export function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      if (isFile) {
        current.push({ name, path, isFolder: false, readOnly: file.readOnly, children: [] });
      } else {
        let folder = current.find((n) => n.name === name && n.isFolder);
        if (!folder) {
          folder = { name, path, isFolder: true, readOnly: file.readOnly, children: [] };
          current.push(folder);
        }
        current = folder.children;
      }
    }
  }

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => { if (n.isFolder) sortNodes(n.children); });
  };
  sortNodes(root);

  return root;
}
