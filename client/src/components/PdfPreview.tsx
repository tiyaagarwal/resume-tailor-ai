interface PdfPreviewProps {
  src: string;
  pageCount: number;
  refreshKey?: string | number;
}

export default function PdfPreview({ src, pageCount, refreshKey }: PdfPreviewProps) {
  const onePage = pageCount === 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="sheet aspect-[8.5/11] w-full overflow-hidden">
        <iframe
          key={refreshKey}
          title="Resume preview"
          src={`${src}#toolbar=0&navpanes=0`}
          className="w-full h-full"
        />
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[11px] text-ink-faint">Live preview</span>
        <span
          className={`font-mono text-[11px] px-2 py-0.5 rounded-full border ${
            onePage ? 'border-approve/30 bg-approve/10 text-approve' : 'border-deny/30 bg-deny/10 text-deny'
          }`}
        >
          Page {pageCount === 0 ? '—' : 1} of {pageCount || '—'}
        </span>
      </div>
    </div>
  );
}
