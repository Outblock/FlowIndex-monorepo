import { useContext, useEffect, useCallback, useState } from 'react';
import { WSMessageContext } from '../contexts/WebSocketContext';

export interface AddressTransfer {
    type: 'ft' | 'nft';
    token: string;
    from: string;
    to: string;
    amount?: string;
    nft_id?: string;
}

export interface AddressTransaction {
    id: string;
    block_height: number;
    status: string;
    payer_address?: string;
    proposer_address?: string;
    timestamp: string;
    execution_status?: string;
    error_message?: string;
    is_evm?: boolean;
    script_hash?: string;
    template_category?: string;
    template_label?: string;
    tags?: string[];
    roles: string[];
    transfers: AddressTransfer[];
}

/**
 * Subscribes to live transaction updates for a specific address.
 * Handles deduplication (Phase 1 + Phase 2 merging) and buffering.
 */
export function useAddressTransactions(address: string) {
    const { subscribe, subscribeAddress, unsubscribeAddress } = useContext(WSMessageContext);
    const [buffer, setBuffer] = useState<Map<string, AddressTransaction>>(new Map());

    // Normalize address to match backend convention
    const normalizedAddr = address.trim().toLowerCase().replace(/^0x/, '');

    // Subscribe to address on mount, unsubscribe on unmount
    useEffect(() => {
        subscribeAddress(normalizedAddr);
        return () => unsubscribeAddress(normalizedAddr);
    }, [normalizedAddr, subscribeAddress, unsubscribeAddress]);

    // Listen for address_transaction messages
    useEffect(() => {
        return subscribe((msg: any) => {
            if (msg.type !== 'address_transaction') return;
            const payload = msg.payload;
            if (payload.address !== normalizedAddr) return;

            const tx = payload.transaction;
            const id = tx.id;

            setBuffer(prev => {
                const next = new Map(prev);
                const existing = next.get(id);
                if (existing) {
                    // Merge: combine roles (dedup) and update transfers if present
                    const mergedRoles = Array.from(new Set([...existing.roles, ...(payload.roles || [])]));
                    next.set(id, {
                        ...existing,
                        ...tx,
                        roles: mergedRoles,
                        transfers: payload.transfers?.length ? payload.transfers : existing.transfers,
                    });
                } else {
                    next.set(id, {
                        ...tx,
                        roles: payload.roles || [],
                        transfers: payload.transfers || [],
                    });
                }
                return next;
            });
        });
    }, [subscribe, normalizedAddr]);

    const newTransactions = Array.from(buffer.values());

    const clearBuffer = useCallback(() => {
        setBuffer(new Map());
    }, []);

    return { newTransactions, clearBuffer, bufferSize: buffer.size };
}
