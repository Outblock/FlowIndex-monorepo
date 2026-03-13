import { AddressLink } from '../AddressLink';
import { getTxAddressBookEntry, type TxAddressBook } from '../../lib/txAddressBook';

export function TxResolvedAddress({
    address,
    book,
    align = 'left',
    className = '',
    neutral = false,
    prefixLen = 8,
    reserveLabelSpace = false,
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
    reserveLabelSpace?: boolean;
    showAvatar?: boolean;
    showTag?: boolean;
    size?: number;
    suffixLen?: number;
}) {
    if (!address) return null;

    const entry = getTxAddressBookEntry(book, address);
    const semanticLabel = entry?.primaryLabel && entry.primaryLabel !== entry.shortAddress ? entry.primaryLabel : '';

    if (!semanticLabel && !reserveLabelSpace) {
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
        <div className={`min-w-0 flex flex-col justify-center gap-0.5 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'} ${className}`}>
            <div className={`w-full ${align === 'right' ? 'text-right' : 'text-left'}`}>
                <span className={`block text-[10px] font-medium text-zinc-700 dark:text-zinc-300 truncate leading-4 ${semanticLabel ? '' : 'opacity-0 select-none'}`}>
                    {semanticLabel || entry?.shortAddress || 'label'}
                </span>
            </div>
            <div className={`max-w-full flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
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
            </div>
        </div>
    );
}

export default TxResolvedAddress;
