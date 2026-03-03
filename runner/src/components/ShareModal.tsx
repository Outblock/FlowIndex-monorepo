import { useState, useRef, useEffect } from 'react';
import { Globe, X, Copy, Check, Link } from 'lucide-react';

interface ShareModalProps {
  projectName: string;
  projectId: string;
  slug: string;
  isPublic: boolean;
  onTogglePublic: (id: string, isPublic: boolean) => void;
  onClose: () => void;
}

export default function ShareModal({
  projectName,
  projectId,
  slug,
  isPublic,
  onTogglePublic,
  onClose,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const shareUrl = `${window.location.origin}?project=${slug}`;

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div
        ref={modalRef}
        className="bg-zinc-800 border border-zinc-700 shadow-2xl w-[380px] rounded-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-200">
            Share &ldquo;{projectName}&rdquo;
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Public toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className={`w-4 h-4 ${isPublic ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span className="text-xs text-zinc-300">Anyone with the link can view</span>
            </div>
            <button
              onClick={() => onTogglePublic(projectId, !isPublic)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                isPublic ? 'bg-emerald-600' : 'bg-zinc-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  isPublic ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </div>

          {/* Share link (only when public) */}
          {isPublic && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-zinc-900 border border-zinc-600 rounded px-2.5 py-1.5">
                <Link className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-[11px] text-zinc-400 truncate">{shareUrl}</span>
              </div>
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded transition-colors shrink-0 ${
                  copied
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {copied ? (
                  <><Check className="w-3 h-3" /> Copied</>
                ) : (
                  <><Copy className="w-3 h-3" /> Copy</>
                )}
              </button>
            </div>
          )}

          {!isPublic && (
            <p className="text-[11px] text-zinc-500">
              Enable public access to generate a shareable link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
