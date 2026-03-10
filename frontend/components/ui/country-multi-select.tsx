'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ALL_COUNTRY_OPTIONS, getCountryLabel } from '@/lib/countries';

import { Input } from './input';

interface CountryMultiSelectProps {
  label: string;
  helperText?: string;
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
}

export function CountryMultiSelect({
  label,
  helperText,
  selectedCodes,
  onChange
}: CountryMultiSelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ALL_COUNTRY_OPTIONS.filter((country) => {
      if (!query) {
        return true;
      }
      return (
        country.label.toLowerCase().includes(query) ||
        country.code.toLowerCase().includes(query)
      );
    });
  }, [search]);

  const toggleCode = (code: string): void => {
    if (selectedSet.has(code)) {
      onChange(selectedCodes.filter((item) => item !== code));
      return;
    }
    onChange([...selectedCodes, code]);
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
        {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
      </div>

      <div ref={containerRef} className="rounded-xl border border-slate-300 bg-white p-3">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 transition hover:border-slate-300"
        >
          <span>
            {selectedCodes.length > 0
              ? `${selectedCodes.length} countr${selectedCodes.length === 1 ? 'y' : 'ies'} selected`
              : 'Select countries'}
          </span>
          <span className={`material-symbols-outlined text-base transition ${isOpen ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>

        <div className="mt-3 flex flex-wrap gap-2">
          {selectedCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {getCountryLabel(code)}
              <button
                type="button"
                onClick={() => toggleCode(code)}
                className="rounded-full text-primary/70 transition hover:text-primary"
                aria-label={`Remove ${getCountryLabel(code)}`}
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </span>
          ))}
        </div>

        {isOpen ? (
          <div className="mt-3 rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 p-3">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search countries"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {filteredOptions.map((country) => {
                const isSelected = selectedSet.has(country.code);
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => toggleCode(country.code)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{country.label}</span>
                    <span className="text-xs text-slate-400">{country.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
