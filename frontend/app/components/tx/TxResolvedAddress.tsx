import { AddressLink } from '../AddressLink';
import { getTxAddressBookEntry, type TxAddressBook } from '../../lib/txAddressBook';

function badgeClass(tone: 'accent' | 'neutral'): string {
    if (tone === 'accent') {
        return 'border-sky-200 dark:border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10';
    }
    return 'border-zinc-200 dark:border-white/10 text-zinc-500 bg-zinc-50 dark:bg-black/20';
}

export function TxResolvedAddress({
    address,
    book,
    align = 'left',
    className = '',
    neutral = false,
    prefixLen = 8,
    showAvatar = true,
    showTag = true,
    size = 14,
    suffixLen = 4,
}: {
    address?: string;
    align?: 'left' | 'right';
    book: TxAddressBook;
    className?: string;
    neutral?: boolean;
    prefixLen?: number;
    showAvatar?: boolean;
    showTag?: boolean;
    size?: number;
    suffixLen?: number;
}) {
    if (!address) return null;

    const entry = getTxAddressBookEntry(book, address);
    const hasSemanticLabel = entry?.primaryLabel && entry.primaryLabel !== entry.shortAddress;
    const badges = entry?.badges.slice(0, 2) || [];

    if (!hasSemanticLabel && badges.length === 0) {
        return (
            <AddressLink
                address={address}
                className={className}
                neutral={neutral}
                prefixLen={prefixLen}
                showAvatar={showAvatar}
                showTag={showTag}
                size={size}
                suffixLen={suffixLen}
            />
        );
    }

    return (
        <div className={`min-w-0 flex flex-col gap-0.5 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'} ${className}`}>
            {hasSemanticLabel && (
                <div className={`max-w-full flex flex-wrap items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {entry.primaryLabel}
                    </span>
                </div>
            )}
            <div className={`max-w-full flex flex-wrap items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                <AddressLink
                    address={address}
                    className="text-[11px]"
                    neutral={neutral}
                    prefixLen={prefixLen}
                    showAvatar={showAvatar}
                    showTag={showTag}
                    size={size}
                    suffixLen={suffixLen}
                />
                {badges.map((badge) => (
                    <span
                        key={`${address}-${badge.label}`}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[9px] ${badge.tone === 'accent' ? 'font-mono' : 'uppercase tracking-wider'} ${badgeClass(badge.tone)}`}
                    >
                        {badge.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

export default TxResolvedAddress;
