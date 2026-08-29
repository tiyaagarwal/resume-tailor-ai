export default function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="sheet border-deny/30 bg-deny/5 px-4 py-3 flex items-start justify-between gap-4">
      <p className="text-sm text-deny">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="text-deny/70 hover:text-deny text-sm font-mono">
          dismiss
        </button>
      )}
    </div>
  );
}
