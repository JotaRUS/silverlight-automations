'use client';

import { useMemo, useState } from 'react';

import { Input } from './input';

interface TagInputProps {
  label: string;
  helperText?: string;
  placeholder?: string;
  values: string[];
  onChange: (values: string[]) => void;
}

function normalizeTokens(rawValue: string): string[] {
  return rawValue
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function TagInput({
  label,
  helperText,
  placeholder,
  values,
  onChange
}: TagInputProps): JSX.Element {
  const [draft, setDraft] = useState('');

  const normalizedValues = useMemo(
    () => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))),
    [values]
  );

  const addDraft = (): void => {
    const tokens = normalizeTokens(draft);
    if (tokens.length === 0) {
      return;
    }
    onChange(Array.from(new Set([...normalizedValues, ...tokens])));
    setDraft('');
  };

  const removeValue = (value: string): void => {
    onChange(normalizedValues.filter((item) => item !== value));
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
        {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          {normalizedValues.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {value}
              <button
                type="button"
                onClick={() => removeValue(value)}
                className="rounded-full text-primary/70 transition hover:text-primary"
                aria-label={`Remove ${value}`}
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </span>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addDraft();
              }
            }}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={addDraft}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
