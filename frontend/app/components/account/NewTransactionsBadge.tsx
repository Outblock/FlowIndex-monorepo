import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

interface Props {
    count: number;
    onClick: () => void;
}

export function NewTransactionsBadge({ count, onClick }: Props) {
    return (
        <AnimatePresence>
            {count > 0 && (
                <motion.button
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={onClick}
                    className="sticky top-0 z-10 w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm font-medium cursor-pointer transition-colors"
                >
                    <ArrowUp className="w-3.5 h-3.5" />
                    {count} new transaction{count !== 1 ? 's' : ''}
                </motion.button>
            )}
        </AnimatePresence>
    );
}
