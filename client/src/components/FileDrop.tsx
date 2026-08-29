import { useRef, useState } from 'react';

interface FileDropProps {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function FileDrop({ label, hint, accept, file, onFile, disabled }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div>
      <label className="field-label">{label}</label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        className={`sheet flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center cursor-pointer transition-all
          ${dragging ? 'border-press ring-2 ring-press/20' : 'hover:border-press/40'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {file ? (
          <>
            <span className="font-mono text-sm text-ink">{file.name}</span>
            <span className="text-xs text-ink-faint">{(file.size / 1024).toFixed(0)} KB — click to replace</span>
          </>
        ) : (
          <>
            <span className="text-sm text-ink-soft">Drop a file here, or click to browse</span>
            <span className="text-xs text-ink-faint">{hint}</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
