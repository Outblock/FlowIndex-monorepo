import { createFileRoute } from '@tanstack/react-router'
import { getEVMTransaction } from '@/api/evm'
import { EVMTxDetail } from '@/components/evm/EVMTxDetail'
import { NotFoundPage } from '@/components/ui/NotFoundPage'
import { buildMeta } from '@/lib/og/meta'
import { Hash } from 'lucide-react'
import type { BSTransaction } from '@/types/blockscout'

export const Route = createFileRoute('/txs/evm/$txId')({
    component: EVMTransactionPage,
    loader: async ({ params }) => {
        const evmHash = params.txId.startsWith('0x') ? params.txId : `0x${params.txId}`;
        try {
            const tx = await getEVMTransaction(evmHash);
            if (tx?.hash) {
                return { tx: tx as BSTransaction, error: null as string | null };
            }
            return { tx: null as BSTransaction | null, error: 'EVM transaction not found' };
        } catch {
            return { tx: null as BSTransaction | null, error: 'EVM transaction not found' };
        }
    },
    head: ({ params }) => {
        const id = params.txId;
        const shortId = id.length > 16 ? `${id.slice(0, 10)}...${id.slice(-8)}` : id;
        return {
            meta: buildMeta({
                title: `EVM Tx ${shortId}`,
                description: `EVM transaction ${id} on Flow`,
                ogImagePath: `tx/${id}`,
            }),
        };
    },
})

function EVMTransactionPage() {
    const { tx, error } = Route.useLoaderData();
    const { txId } = Route.useParams();

    if (error || !tx) {
        return (
            <NotFoundPage
                icon={Hash}
                title="EVM Transaction Not Found"
                identifier={txId}
                description="This EVM transaction hasn't been indexed yet or doesn't exist."
                hint="Try searching on Blockscout or check back later."
            />
        );
    }

    return <EVMTxDetail tx={tx} />;
}
