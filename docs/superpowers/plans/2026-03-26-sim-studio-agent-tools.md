# Sim Studio Agent Tools: Template Discovery + Preflight Simulation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cadence template discovery and preflight simulation as local blocks/tools to Sim Studio, enabling agents to browse 71 audited templates and simulate transactions before execution.

**Architecture:** 4 new tools + 2 new blocks + 4 API routes in `sim-workflow/apps/sim/`. Templates imported from `@flowindex/agent-wallet` via new `"./templates"` subpath export. Simulation calls the existing FlowIndex simulator API.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, `@flowindex/agent-wallet` (templates only), FlowIndex Simulator REST API

**Spec:** `docs/superpowers/specs/2026-03-26-sim-studio-agent-tools-design.md`

---

## File Structure

**New files (15):**
```
packages/agent-wallet/src/templates/index.ts          — subpath export barrel
apps/sim/tools/flow/list_templates.ts                  — tool definition
apps/sim/tools/flow/get_template.ts                    — tool definition
apps/sim/tools/flow/simulate_transaction.ts            — tool definition
apps/sim/tools/flow/simulate_template.ts               — tool definition
apps/sim/blocks/blocks/flow_templates.ts               — block definition
apps/sim/blocks/blocks/flow_simulate.ts                — block definition
apps/sim/app/api/tools/flow/list-templates/route.ts    — API route
apps/sim/app/api/tools/flow/get-template/route.ts      — API route
apps/sim/app/api/tools/flow/simulate-transaction/route.ts  — API route
apps/sim/app/api/tools/flow/simulate-template/route.ts     — API route
apps/sim/app/api/tools/flow/list-templates/route.test.ts   — test
apps/sim/app/api/tools/flow/get-template/route.test.ts         — test
apps/sim/app/api/tools/flow/simulate-transaction/route.test.ts — test
apps/sim/app/api/tools/flow/simulate-template/route.test.ts   — test
```

**Modified files (6):**
```
packages/agent-wallet/package.json      — add "./templates" subpath export
packages/agent-wallet/tsup.config.ts    — add templates/index entry point
apps/sim/package.json                   — add @flowindex/agent-wallet dependency
apps/sim/tools/flow/index.ts            — add 4 new tool exports to barrel
apps/sim/tools/registry.ts              — register 4 new tools
apps/sim/blocks/registry.ts             — register 2 new blocks
```

---

### Task 1: Add subpath export to agent-wallet

**Files:**
- Create: `packages/agent-wallet/src/templates/index.ts`
- Modify: `packages/agent-wallet/package.json`

- [ ] **Step 1: Create barrel export for templates**

Create `packages/agent-wallet/src/templates/index.ts`:

```typescript
export { getTemplates, getTemplate, listTemplates } from './registry'
export type { Template, TemplateArg } from './registry'
```

Note: `Template` and `TemplateArg` interfaces need to be exported from `registry.ts` if not already. Check and add `export` to them.

- [ ] **Step 2: Add subpath export to package.json**

In `packages/agent-wallet/package.json`, update the `exports` field:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./templates": {
      "import": "./dist/templates/index.js",
      "types": "./dist/templates/index.d.ts"
    }
  }
}
```

- [ ] **Step 3: Update tsup config to add templates entry point**

Check `packages/agent-wallet/tsup.config.ts` (or `tsup` config in `package.json`). Add `src/templates/index.ts` as a second entry point so it compiles to `dist/templates/index.js`. Example:

```typescript
entry: ['src/index.ts', 'src/templates/index.ts'],
```

Also verify the existing post-build step that copies `.cdc` files to `dist/cadence/` still works — the template registry uses `import.meta.url` to resolve `.cdc` files relative to itself, so the `dist/cadence/` directory must be present next to `dist/templates/index.js`. If needed, update the copy command to ensure `dist/cadence/` is populated.

- [ ] **Step 4: Rebuild agent-wallet**

Run: `cd packages/agent-wallet && bun run build`
Expected: Build succeeds, `dist/templates/index.js` and `dist/templates/index.d.ts` are generated, `dist/cadence/` directory exists with `.cdc` files.

- [ ] **Step 5: Verify subpath import works**

Run: `cd sim-workflow/apps/sim && node -e "import('@flowindex/agent-wallet/templates').then(m => console.log(Object.keys(m)))"`
Expected: `['getTemplates', 'getTemplate', 'listTemplates']` (or similar)

- [ ] **Step 6: Commit**

```bash
git add packages/agent-wallet/src/templates/index.ts packages/agent-wallet/package.json
git commit -m "feat(agent-wallet): add ./templates subpath export for Sim Studio integration"
```

---

### Task 2: Add agent-wallet dependency to Sim Studio

**Files:**
- Modify: `apps/sim/package.json`

- [ ] **Step 1: Add dependency**

In `sim-workflow/apps/sim/package.json`, add to `dependencies`:

```json
"@flowindex/agent-wallet": "workspace:*"
```

- [ ] **Step 2: Install**

Run: `cd sim-workflow && bun install`
Expected: No errors, workspace link created.

- [ ] **Step 3: Commit**

```bash
git add sim-workflow/apps/sim/package.json sim-workflow/bun.lock
git commit -m "chore(sim): add @flowindex/agent-wallet workspace dependency"
```

---

### Task 3: Template Discovery tools + types

**Files:**
- Modify: `apps/sim/tools/flow/types.ts` (add new param/response types)
- Create: `apps/sim/tools/flow/list_templates.ts`
- Create: `apps/sim/tools/flow/get_template.ts`

- [ ] **Step 1: Add types to `tools/flow/types.ts`**

Append to `sim-workflow/apps/sim/tools/flow/types.ts`:

```typescript
/** Parameters for listing Cadence templates */
export interface FlowListTemplatesParams {
  category?: string
}

/** Parameters for getting a single Cadence template */
export interface FlowGetTemplateParams {
  templateId: string
}

/** Cadence template metadata (from agent-wallet registry) */
export interface CadenceTemplate {
  name: string
  category: string
  type: 'transaction' | 'script'
  description: string
}

/** Cadence template with full source */
export interface CadenceTemplateDetail extends CadenceTemplate {
  cadence: string
  arguments: Array<{ name: string; type: string; description: string }>
}
```

- [ ] **Step 2: Create `list_templates.ts` tool**

Create `sim-workflow/apps/sim/tools/flow/list_templates.ts`:

```typescript
import type { ToolConfig } from '@/tools/types'
import type { FlowListTemplatesParams } from '@/tools/flow/types'

export interface FlowListTemplatesResponse {
  success: boolean
  output: {
    content: string
    templates: Array<{
      name: string
      category: string
      type: string
      description: string
    }>
  }
}

export const flowListTemplatesTool: ToolConfig<
  FlowListTemplatesParams,
  FlowListTemplatesResponse
> = {
  id: 'flow_list_templates',
  name: 'Flow List Templates',
  description:
    'List available audited Cadence transaction and script templates by category',
  version: '1.0.0',

  params: {
    category: {
      type: 'string',
      required: false,
      description:
        'Filter by category: base, token, collection, bridge, evm, hybrid-custody, lost-and-found',
    },
  },

  request: {
    url: '/api/tools/flow/list-templates',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      category: params.category,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: { content: data.error || 'Failed to list templates', templates: [] },
        error: data.error,
      } as unknown as FlowListTemplatesResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Summary of available templates' },
    templates: { type: 'json', description: 'Array of template metadata' },
  },
}
```

- [ ] **Step 3: Create `get_template.ts` tool**

Create `sim-workflow/apps/sim/tools/flow/get_template.ts`:

```typescript
import type { ToolConfig } from '@/tools/types'
import type { FlowGetTemplateParams } from '@/tools/flow/types'

export interface FlowGetTemplateResponse {
  success: boolean
  output: {
    content: string
    template: {
      name: string
      category: string
      type: string
      description: string
      cadence: string
      arguments: Array<{ name: string; type: string; description: string }>
    }
  }
}

export const flowGetTemplateTool: ToolConfig<
  FlowGetTemplateParams,
  FlowGetTemplateResponse
> = {
  id: 'flow_get_template',
  name: 'Flow Get Template',
  description:
    'Get the full Cadence source code and argument schema for a specific template',
  version: '1.0.0',

  params: {
    templateId: {
      type: 'string',
      required: true,
      description: 'Template name (e.g. "transfer_tokens_v3")',
    },
  },

  request: {
    url: '/api/tools/flow/get-template',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      templateId: params.templateId,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: { content: data.error || 'Template not found', template: null },
        error: data.error,
      } as unknown as FlowGetTemplateResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Template description and argument info' },
    template: { type: 'json', description: 'Full template with Cadence source' },
  },
}
```

- [ ] **Step 4: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/types.ts sim-workflow/apps/sim/tools/flow/list_templates.ts sim-workflow/apps/sim/tools/flow/get_template.ts
git commit -m "feat(sim): add template discovery tool definitions"
```

---

### Task 4: Template Discovery API routes

**Files:**
- Create: `apps/sim/app/api/tools/flow/list-templates/route.ts`
- Create: `apps/sim/app/api/tools/flow/get-template/route.ts`

- [ ] **Step 1: Write test for list-templates route**

Create `sim-workflow/apps/sim/app/api/tools/flow/list-templates/route.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockListTemplates } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockListTemplates: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@flowindex/agent-wallet/templates', () => ({
  listTemplates: mockListTemplates,
}))

import { POST } from './route'

describe('flow/list-templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns all templates when no category specified', async () => {
    mockListTemplates.mockReturnValue([
      { name: 'transfer_tokens_v3', category: 'token', type: 'transaction', description: 'Transfer tokens' },
      { name: 'create_coa', category: 'evm', type: 'transaction', description: 'Create COA' },
    ])

    const req = createMockRequest('POST', {})
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.templates).toHaveLength(2)
    expect(mockListTemplates).toHaveBeenCalledWith(undefined)
  })

  it('filters by category', async () => {
    mockListTemplates.mockReturnValue([
      { name: 'transfer_tokens_v3', category: 'token', type: 'transaction', description: 'Transfer tokens' },
    ])

    const req = createMockRequest('POST', { category: 'token' })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.templates).toHaveLength(1)
    expect(mockListTemplates).toHaveBeenCalledWith('token')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/list-templates/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement list-templates route**

Create `sim-workflow/apps/sim/app/api/tools/flow/list-templates/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { listTemplates } from '@flowindex/agent-wallet/templates'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/list-templates')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const category = body.category as string | undefined

    const templates = listTemplates(category).map((t) => ({
      name: t.name,
      category: t.category,
      type: t.type,
      description: t.description,
    }))

    const content = `Found ${templates.length} templates${category ? ` in category "${category}"` : ''}`

    return NextResponse.json({
      success: true,
      output: { content, templates },
    })
  } catch (error) {
    logger.error('Failed to list templates', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/list-templates/route.test.ts`
Expected: PASS

- [ ] **Step 5: Write test for get-template route**

Create `sim-workflow/apps/sim/app/api/tools/flow/get-template/route.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockGetTemplate } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockGetTemplate: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@flowindex/agent-wallet/templates', () => ({
  getTemplate: mockGetTemplate,
}))

import { POST } from './route'

describe('flow/get-template route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', { templateId: 'transfer_tokens_v3' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when templateId is missing', async () => {
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when template not found', async () => {
    mockGetTemplate.mockReturnValue(undefined)
    const req = createMockRequest('POST', { templateId: 'nonexistent' })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns full template with cadence source and args', async () => {
    mockGetTemplate.mockReturnValue({
      name: 'transfer_tokens_v3',
      category: 'token',
      type: 'transaction',
      description: 'Transfer fungible tokens',
      cadence: 'transaction(amount: UFix64, to: Address) { ... }',
      args: [
        { name: 'amount', type: 'UFix64', description: 'Amount to transfer' },
        { name: 'to', type: 'Address', description: 'Recipient address' },
      ],
    })

    const req = createMockRequest('POST', { templateId: 'transfer_tokens_v3' })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.template.name).toBe('transfer_tokens_v3')
    expect(json.output.template.cadence).toContain('transaction')
    expect(json.output.template.arguments).toHaveLength(2)
    expect(json.output.content).toContain('amount: UFix64')
  })
})
```

- [ ] **Step 7: Implement get-template route**

Create `sim-workflow/apps/sim/app/api/tools/flow/get-template/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { getTemplate } from '@flowindex/agent-wallet/templates'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/get-template')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const templateId = body.templateId as string

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'templateId is required' },
        { status: 400 }
      )
    }

    const template = getTemplate(templateId)
    if (!template) {
      return NextResponse.json(
        { success: false, error: `Template "${templateId}" not found` },
        { status: 404 }
      )
    }

    const argsDesc = template.args.length > 0
      ? template.args.map((a) => `${a.name}: ${a.type}`).join(', ')
      : 'none'
    const content = `${template.description}\nArguments: ${argsDesc}`

    return NextResponse.json({
      success: true,
      output: {
        content,
        template: {
          name: template.name,
          category: template.category,
          type: template.type,
          description: template.description,
          cadence: template.cadence,
          arguments: template.args,
        },
      },
    })
  } catch (error) {
    logger.error('Failed to get template', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add sim-workflow/apps/sim/app/api/tools/flow/list-templates/ sim-workflow/apps/sim/app/api/tools/flow/get-template/
git commit -m "feat(sim): add template discovery API routes with tests"
```

---

### Task 5: Simulation tools

**Files:**
- Modify: `apps/sim/tools/flow/types.ts` (add simulation param types)
- Create: `apps/sim/tools/flow/simulate_transaction.ts`
- Create: `apps/sim/tools/flow/simulate_template.ts`

- [ ] **Step 1: Add simulation types to `tools/flow/types.ts`**

Append to `sim-workflow/apps/sim/tools/flow/types.ts`:

```typescript
/** Parameters for simulating a raw Cadence transaction */
export interface FlowSimulateTransactionParams {
  cadence: string
  arguments?: string
  network?: string
  signerAddress?: string
}

/** Parameters for simulating a template-based transaction */
export interface FlowSimulateTemplateParams {
  templateId: string
  arguments?: string
  network?: string
  signerAddress?: string
}

/** Simulator balance change */
export interface SimulatorBalanceChange {
  address: string
  token: string
  delta: string
  before?: string
  after?: string
}

/** Simulator event */
export interface SimulatorEvent {
  type: string
  payload: unknown
}
```

- [ ] **Step 2: Create `simulate_transaction.ts` tool**

Create `sim-workflow/apps/sim/tools/flow/simulate_transaction.ts`:

```typescript
import type { ToolConfig } from '@/tools/types'
import type { FlowSimulateTransactionParams } from '@/tools/flow/types'

export interface FlowSimulateTransactionResponse {
  success: boolean
  output: {
    content: string
    simulationSuccess: boolean
    events: Array<{ type: string; payload: unknown }>
    computationUsed: number
    balanceChanges: Array<{
      address: string
      token: string
      delta: string
    }>
    error?: string
  }
}

export const flowSimulateTransactionTool: ToolConfig<
  FlowSimulateTransactionParams,
  FlowSimulateTransactionResponse
> = {
  id: 'flow_simulate_transaction',
  name: 'Flow Simulate Transaction',
  description:
    'Simulate a Cadence transaction on mainnet-fork without signing. Returns events, gas usage, and balance changes.',
  version: '1.0.0',

  params: {
    cadence: {
      type: 'string',
      required: true,
      description: 'Cadence transaction code to simulate',
    },
    arguments: {
      type: 'string',
      required: false,
      description: 'JSON-CDC arguments array (default: [])',
    },
    network: {
      type: 'string',
      required: false,
      description: 'Flow network: mainnet only (default: mainnet)',
    },
    signerAddress: {
      type: 'string',
      required: false,
      description: 'Flow address to use as authorizer (16-char hex)',
    },
  },

  request: {
    url: '/api/tools/flow/simulate-transaction',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      cadence: params.cadence,
      arguments: params.arguments ?? '[]',
      network: params.network ?? 'mainnet',
      signerAddress: params.signerAddress,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'Simulation failed',
          simulationSuccess: false,
          events: [],
          computationUsed: 0,
          balanceChanges: [],
          error: data.error,
        },
        error: data.error,
      } as unknown as FlowSimulateTransactionResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Human-readable simulation summary' },
    simulationSuccess: { type: 'boolean', description: 'Whether the simulated tx succeeded' },
    events: { type: 'json', description: 'Emitted Cadence events' },
    computationUsed: { type: 'number', description: 'Computation (gas) used' },
    balanceChanges: { type: 'json', description: 'Token balance changes' },
    error: { type: 'string', description: 'Error message if simulation failed' },
  },
}
```

- [ ] **Step 3: Create `simulate_template.ts` tool**

Create `sim-workflow/apps/sim/tools/flow/simulate_template.ts`:

```typescript
import type { ToolConfig } from '@/tools/types'
import type { FlowSimulateTemplateParams } from '@/tools/flow/types'
import type { FlowSimulateTransactionResponse } from '@/tools/flow/simulate_transaction'

export const flowSimulateTemplateTool: ToolConfig<
  FlowSimulateTemplateParams,
  FlowSimulateTransactionResponse
> = {
  id: 'flow_simulate_template',
  name: 'Flow Simulate Template',
  description:
    'Simulate a Cadence template transaction on mainnet-fork. Resolves template and converts key-value arguments to JSON-CDC before simulation.',
  version: '1.0.0',

  params: {
    templateId: {
      type: 'string',
      required: true,
      description: 'Template name (e.g. "transfer_tokens_v3")',
    },
    arguments: {
      type: 'string',
      required: false,
      description: 'JSON key-value arguments (e.g. {"amount": "100.0", "to": "0xabcdef1234567890"})',
    },
    network: {
      type: 'string',
      required: false,
      description: 'Flow network: mainnet only (default: mainnet)',
    },
    signerAddress: {
      type: 'string',
      required: false,
      description: 'Flow address to use as authorizer (16-char hex)',
    },
  },

  request: {
    url: '/api/tools/flow/simulate-template',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      templateId: params.templateId,
      arguments: params.arguments ?? '{}',
      network: params.network ?? 'mainnet',
      signerAddress: params.signerAddress,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'Simulation failed',
          simulationSuccess: false,
          events: [],
          computationUsed: 0,
          balanceChanges: [],
          error: data.error,
        },
        error: data.error,
      } as unknown as FlowSimulateTransactionResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Human-readable simulation summary' },
    simulationSuccess: { type: 'boolean', description: 'Whether the simulated tx succeeded' },
    events: { type: 'json', description: 'Emitted Cadence events' },
    computationUsed: { type: 'number', description: 'Computation (gas) used' },
    balanceChanges: { type: 'json', description: 'Token balance changes' },
    error: { type: 'string', description: 'Error message if simulation failed' },
  },
}
```

- [ ] **Step 4: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/types.ts sim-workflow/apps/sim/tools/flow/simulate_transaction.ts sim-workflow/apps/sim/tools/flow/simulate_template.ts
git commit -m "feat(sim): add simulation tool definitions"
```

---

### Task 6: Simulation API routes

**Files:**
- Create: `apps/sim/app/api/tools/flow/simulate-transaction/route.ts`
- Create: `apps/sim/app/api/tools/flow/simulate-transaction/route.test.ts`
- Create: `apps/sim/app/api/tools/flow/simulate-template/route.ts`
- Create: `apps/sim/app/api/tools/flow/simulate-template/route.test.ts`

- [ ] **Step 1: Write test for simulate-transaction route**

Create `sim-workflow/apps/sim/app/api/tools/flow/simulate-transaction/route.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockFetch } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

// Mock global fetch for simulator API calls
vi.stubGlobal('fetch', mockFetch)

import { POST } from './route'

describe('flow/simulate-transaction route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', { cadence: 'transaction() {}' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when cadence is missing', async () => {
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for testnet (simulation only supports mainnet)', async () => {
    const req = createMockRequest('POST', {
      cadence: 'transaction() { execute {} }',
      network: 'testnet',
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain('mainnet')
  })

  it('calls simulator API and returns results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        events: [{ type: 'A.1654653399040a61.FlowToken.TokensWithdrawn', payload: {} }],
        computation_used: 145,
        balance_changes: [{ address: 'f8d6e0586b0a20c7', token: 'FlowToken', delta: '-10.0' }],
      }),
    })

    const req = createMockRequest('POST', {
      cadence: 'transaction() { execute {} }',
      arguments: '[]',
      signerAddress: 'f8d6e0586b0a20c7',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.simulationSuccess).toBe(true)
    expect(json.output.events).toHaveLength(1)
    expect(json.output.computationUsed).toBe(145)
    expect(json.output.balanceChanges).toHaveLength(1)

    // Verify simulator was called correctly
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/simulate'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    )
  })

  it('handles simulator error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        error: 'cadence execution error: ...',
        computation_used: 0,
        events: [],
        balance_changes: [],
      }),
    })

    const req = createMockRequest('POST', {
      cadence: 'transaction() { execute { panic("fail") } }',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true) // route succeeded
    expect(json.output.simulationSuccess).toBe(false) // simulation failed
    expect(json.output.error).toContain('cadence execution error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/simulate-transaction/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement simulate-transaction route**

Create `sim-workflow/apps/sim/app/api/tools/flow/simulate-transaction/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/simulate-transaction')

const DEFAULT_SIMULATOR_URL = 'https://simulator.flowindex.io/api'
const DEFAULT_PAYER = 'e467b9dd11fa00df' // Emulator service account

function normalizeAddress(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase()
}

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { cadence, network, signerAddress } = body
    const args = body.arguments ?? '[]'

    if (!cadence) {
      return NextResponse.json(
        { success: false, error: 'cadence is required' },
        { status: 400 }
      )
    }

    if (network === 'testnet') {
      return NextResponse.json(
        { success: false, error: 'Simulation only supports mainnet (mainnet-fork emulator)' },
        { status: 400 }
      )
    }

    const simulatorUrl = process.env.FLOW_SIMULATOR_URL || DEFAULT_SIMULATOR_URL
    const authorizer = signerAddress ? normalizeAddress(signerAddress) : DEFAULT_PAYER

    let parsedArgs: unknown[]
    try {
      parsedArgs = JSON.parse(args)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in arguments' },
        { status: 400 }
      )
    }

    const simulatorResponse = await fetch(`${simulatorUrl}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cadence,
        arguments: parsedArgs,
        authorizers: [authorizer],
        payer: DEFAULT_PAYER,
      }),
    })

    const result = await simulatorResponse.json()

    const balanceChanges = (result.balance_changes ?? []).map(
      (bc: { address: string; token: string; delta: string }) => ({
        address: bc.address,
        token: bc.token,
        delta: bc.delta,
      })
    )

    const events = (result.events ?? []).map(
      (e: { type: string; payload: unknown }) => ({
        type: e.type,
        payload: e.payload,
      })
    )

    const summary = result.success
      ? `Simulation passed. ${events.length} events, ${result.computation_used} computation used.`
      : `Simulation failed: ${result.error}`

    return NextResponse.json({
      success: true,
      output: {
        content: summary,
        simulationSuccess: result.success,
        events,
        computationUsed: result.computation_used ?? 0,
        balanceChanges,
        error: result.success ? undefined : result.error,
      },
    })
  } catch (error) {
    logger.error('Simulation request failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/simulate-transaction/route.test.ts`
Expected: PASS

- [ ] **Step 5: Write test for simulate-template route**

Create `sim-workflow/apps/sim/app/api/tools/flow/simulate-template/route.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockGetTemplate, mockFetch } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockGetTemplate: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@flowindex/agent-wallet/templates', () => ({
  getTemplate: mockGetTemplate,
}))

vi.stubGlobal('fetch', mockFetch)

import { POST } from './route'

describe('flow/simulate-template route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', { templateId: 'transfer_tokens_v3' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 404 when template not found', async () => {
    mockGetTemplate.mockReturnValue(undefined)
    const req = createMockRequest('POST', { templateId: 'nonexistent' })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('converts key-value args to JSON-CDC and calls simulator', async () => {
    mockGetTemplate.mockReturnValue({
      name: 'transfer_tokens_v3',
      category: 'token',
      type: 'transaction',
      description: 'Transfer tokens',
      cadence: 'transaction(amount: UFix64, to: Address) { ... }',
      args: [
        { name: 'amount', type: 'UFix64', description: 'Amount to transfer' },
        { name: 'to', type: 'Address', description: 'Recipient address' },
      ],
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        events: [],
        computation_used: 100,
        balance_changes: [],
      }),
    })

    const req = createMockRequest('POST', {
      templateId: 'transfer_tokens_v3',
      arguments: '{"amount": "100.0", "to": "0xabcdef1234567890"}',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.simulationSuccess).toBe(true)

    // Verify simulator received JSON-CDC formatted args
    const fetchCall = mockFetch.mock.calls[0]
    const fetchBody = JSON.parse(fetchCall[1].body)
    expect(fetchBody.arguments).toEqual([
      { type: 'UFix64', value: '100.0' },
      { type: 'Address', value: '0xabcdef1234567890' },
    ])
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/simulate-template/route.test.ts`
Expected: FAIL — `./route` module not found.

- [ ] **Step 7: Implement simulate-template route**

Create `sim-workflow/apps/sim/app/api/tools/flow/simulate-template/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { getTemplate } from '@flowindex/agent-wallet/templates'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/simulate-template')

const DEFAULT_SIMULATOR_URL = 'https://simulator.flowindex.io/api'
const DEFAULT_PAYER = 'e467b9dd11fa00df'

function normalizeAddress(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase()
}

/** Convert key-value args to JSON-CDC format using template arg schema */
function toJsonCdc(
  kvArgs: Record<string, string>,
  schema: Array<{ name: string; type: string }>
): Array<{ type: string; value: string }> {
  return schema.map((arg) => ({
    type: arg.type,
    value: kvArgs[arg.name] ?? '',
  }))
}

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { templateId, network, signerAddress } = body
    const argsStr = body.arguments ?? '{}'

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'templateId is required' },
        { status: 400 }
      )
    }

    if (network === 'testnet') {
      return NextResponse.json(
        { success: false, error: 'Simulation only supports mainnet (mainnet-fork emulator)' },
        { status: 400 }
      )
    }

    const template = getTemplate(templateId)
    if (!template) {
      return NextResponse.json(
        { success: false, error: `Template "${templateId}" not found` },
        { status: 404 }
      )
    }

    let kvArgs: Record<string, string>
    try {
      kvArgs = JSON.parse(argsStr)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in arguments' },
        { status: 400 }
      )
    }

    const jsonCdcArgs = toJsonCdc(kvArgs, template.args)
    const simulatorUrl = process.env.FLOW_SIMULATOR_URL || DEFAULT_SIMULATOR_URL
    const authorizer = signerAddress ? normalizeAddress(signerAddress) : DEFAULT_PAYER

    const simulatorResponse = await fetch(`${simulatorUrl}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cadence: template.cadence,
        arguments: jsonCdcArgs,
        authorizers: [authorizer],
        payer: DEFAULT_PAYER,
      }),
    })

    const result = await simulatorResponse.json()

    const balanceChanges = (result.balance_changes ?? []).map(
      (bc: { address: string; token: string; delta: string }) => ({
        address: bc.address,
        token: bc.token,
        delta: bc.delta,
      })
    )

    const events = (result.events ?? []).map(
      (e: { type: string; payload: unknown }) => ({
        type: e.type,
        payload: e.payload,
      })
    )

    const summary = result.success
      ? `Template "${templateId}" simulation passed. ${events.length} events, ${result.computation_used} computation used.`
      : `Template "${templateId}" simulation failed: ${result.error}`

    return NextResponse.json({
      success: true,
      output: {
        content: summary,
        simulationSuccess: result.success,
        events,
        computationUsed: result.computation_used ?? 0,
        balanceChanges,
        error: result.success ? undefined : result.error,
      },
    })
  } catch (error) {
    logger.error('Template simulation failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/simulate-template/route.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add sim-workflow/apps/sim/app/api/tools/flow/simulate-transaction/ sim-workflow/apps/sim/app/api/tools/flow/simulate-template/
git commit -m "feat(sim): add simulation API routes with tests"
```

---

### Task 7: Block definitions

**Files:**
- Create: `apps/sim/blocks/blocks/flow_templates.ts`
- Create: `apps/sim/blocks/blocks/flow_simulate.ts`

- [ ] **Step 1: Create `flow_templates.ts` block**

Create `sim-workflow/apps/sim/blocks/blocks/flow_templates.ts`:

```typescript
import { FlowIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const FlowTemplatesBlock: BlockConfig = {
  type: 'flow_templates',
  name: 'Flow Templates',
  description: 'Browse and inspect audited Cadence transaction and script templates',
  category: 'tools',
  bgColor: '#00EF8B',
  icon: FlowIcon,
  subBlocks: [
    {
      id: 'action',
      title: 'Action',
      type: 'dropdown',
      options: [
        { label: 'List Templates', id: 'list' },
        { label: 'Get Template', id: 'get' },
      ],
    },
    {
      id: 'category',
      title: 'Category',
      type: 'dropdown',
      options: [
        { label: 'All', id: '' },
        { label: 'Base', id: 'base' },
        { label: 'Token', id: 'token' },
        { label: 'Collection (NFT)', id: 'collection' },
        { label: 'Bridge', id: 'bridge' },
        { label: 'EVM', id: 'evm' },
        { label: 'Hybrid Custody', id: 'hybrid-custody' },
        { label: 'Lost and Found', id: 'lost-and-found' },
      ],
      condition: { field: 'action', value: 'list' },
    },
    {
      id: 'templateId',
      title: 'Template ID',
      type: 'short-input',
      placeholder: 'e.g. transfer_tokens_v3',
      condition: { field: 'action', value: 'get' },
    },
  ],
  tools: {
    access: ['flow_list_templates', 'flow_get_template'],
    config: {
      tool: (params) =>
        params.action === 'get' ? 'flow_get_template' : 'flow_list_templates',
      params: (params) => {
        if (params.action === 'get') {
          return { templateId: params.templateId }
        }
        return { category: params.category || undefined }
      },
    },
  },
  inputs: {
    action: { type: 'string', description: 'Action: list or get' },
    category: { type: 'string', description: 'Template category filter' },
    templateId: { type: 'string', description: 'Template name to retrieve' },
  },
  outputs: {
    content: { type: 'string', description: 'Summary text' },
    templates: { type: 'json', description: 'Template list (list action)' },
    template: { type: 'json', description: 'Full template detail (get action)' },
  },
}
```

- [ ] **Step 2: Create `flow_simulate.ts` block**

Create `sim-workflow/apps/sim/blocks/blocks/flow_simulate.ts`:

```typescript
import { FlowIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const FlowSimulateBlock: BlockConfig = {
  type: 'flow_simulate',
  name: 'Flow Simulate',
  description:
    'Simulate a Cadence transaction on mainnet-fork without signing. Preview events, gas, and balance changes.',
  category: 'tools',
  bgColor: '#00EF8B',
  icon: FlowIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Raw Cadence', id: 'raw' },
        { label: 'Template', id: 'template' },
      ],
    },
    {
      id: 'cadence',
      title: 'Cadence Transaction',
      type: 'code',
      placeholder: 'transaction() {\n  prepare(signer: &Account) {}\n  execute {}\n}',
      condition: { field: 'mode', value: 'raw' },
    },
    {
      id: 'templateId',
      title: 'Template ID',
      type: 'short-input',
      placeholder: 'e.g. transfer_tokens_v3',
      condition: { field: 'mode', value: 'template' },
    },
    {
      id: 'arguments',
      title: 'Arguments',
      type: 'code',
      placeholder: '[]',
    },
    {
      id: 'network',
      title: 'Network',
      type: 'dropdown',
      options: [
        { label: 'Mainnet', id: 'mainnet' },
        { label: 'Testnet', id: 'testnet' },
      ],
    },
    {
      id: 'signerAddress',
      title: 'Signer Address (optional)',
      type: 'short-input',
      placeholder: 'Flow address (16-char hex)',
    },
  ],
  tools: {
    access: ['flow_simulate_transaction', 'flow_simulate_template'],
    config: {
      tool: (params) =>
        params.mode === 'template'
          ? 'flow_simulate_template'
          : 'flow_simulate_transaction',
      params: (params) => {
        if (params.mode === 'template') {
          return {
            templateId: params.templateId,
            arguments: params.arguments ?? '{}',
            network: params.network ?? 'mainnet',
            signerAddress: params.signerAddress || undefined,
          }
        }
        return {
          cadence: params.cadence,
          arguments: params.arguments ?? '[]',
          network: params.network ?? 'mainnet',
          signerAddress: params.signerAddress || undefined,
        }
      },
    },
  },
  inputs: {
    mode: { type: 'string', description: 'Simulation mode: raw or template' },
    cadence: { type: 'string', description: 'Raw Cadence transaction code' },
    templateId: { type: 'string', description: 'Template name' },
    arguments: { type: 'string', description: 'Transaction arguments' },
    network: { type: 'string', description: 'Flow network' },
    signerAddress: { type: 'string', description: 'Authorizer address' },
  },
  outputs: {
    content: { type: 'string', description: 'Human-readable simulation summary' },
    simulationSuccess: { type: 'boolean', description: 'Whether simulation passed' },
    events: { type: 'json', description: 'Emitted Cadence events' },
    computationUsed: { type: 'number', description: 'Gas computation used' },
    balanceChanges: { type: 'json', description: 'Token balance changes' },
    error: { type: 'string', description: 'Error if simulation failed' },
  },
}
```

- [ ] **Step 3: Commit**

```bash
git add sim-workflow/apps/sim/blocks/blocks/flow_templates.ts sim-workflow/apps/sim/blocks/blocks/flow_simulate.ts
git commit -m "feat(sim): add template discovery and simulation block definitions"
```

---

### Task 8: Register tools and blocks

**Files:**
- Modify: `apps/sim/tools/registry.ts`
- Modify: `apps/sim/blocks/registry.ts`

- [ ] **Step 1: Register 4 new tools in `tools/registry.ts`**

Add imports at the top of the Flow tools import section:

```typescript
import { flowListTemplatesTool } from '@/tools/flow/list_templates'
import { flowGetTemplateTool } from '@/tools/flow/get_template'
import { flowSimulateTransactionTool } from '@/tools/flow/simulate_transaction'
import { flowSimulateTemplateTool } from '@/tools/flow/simulate_template'
```

Add to the registry object (alphabetically within the Flow section):

```typescript
flow_get_template: flowGetTemplateTool,
flow_list_templates: flowListTemplatesTool,
flow_simulate_template: flowSimulateTemplateTool,
flow_simulate_transaction: flowSimulateTransactionTool,
```

- [ ] **Step 2: Update `tools/flow/index.ts` barrel file**

Add to the barrel file at `sim-workflow/apps/sim/tools/flow/index.ts`:

```typescript
export { flowListTemplatesTool } from '@/tools/flow/list_templates'
export { flowGetTemplateTool } from '@/tools/flow/get_template'
export { flowSimulateTransactionTool } from '@/tools/flow/simulate_transaction'
export { flowSimulateTemplateTool } from '@/tools/flow/simulate_template'
```

- [ ] **Step 3: Register 2 new blocks in `blocks/registry.ts`**

Add imports:

```typescript
import { FlowSimulateBlock } from '@/blocks/blocks/flow_simulate'
import { FlowTemplatesBlock } from '@/blocks/blocks/flow_templates'
```

Add to the registry object (alphabetically):

```typescript
flow_simulate: FlowSimulateBlock,
flow_templates: FlowTemplatesBlock,
```

- [ ] **Step 4: Run existing block tests to ensure no regressions**

Run: `cd sim-workflow && bunx vitest run apps/sim/blocks/blocks.test.ts`
Expected: PASS — existing block validation tests still pass.

- [ ] **Step 5: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/index.ts sim-workflow/apps/sim/tools/registry.ts sim-workflow/apps/sim/blocks/registry.ts
git commit -m "feat(sim): register template and simulation tools/blocks in registries"
```

---

### Task 9: Integration verification

- [ ] **Step 1: Run all new tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/list-templates/ apps/sim/app/api/tools/flow/simulate-transaction/ apps/sim/app/api/tools/flow/simulate-template/`
Expected: All PASS.

- [ ] **Step 2: Run full Flow-related test suite**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/`
Expected: All PASS — no regressions in existing Flow tools.

- [ ] **Step 3: Run block validation tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/blocks/`
Expected: All PASS.

- [ ] **Step 4: Type-check the project**

Run: `cd sim-workflow && bunx tsc --noEmit -p apps/sim/tsconfig.json`
Expected: No type errors.

- [ ] **Step 5: Build verification**

Run: `cd sim-workflow && bun run build --filter=sim`
Expected: Build succeeds.

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(sim): address type/build issues from integration"
```
