"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AsyncSearchSelect } from "@/components/ui/AsyncSearchSelect";
import {
  formatE164,
  flagEmoji,
  getPhoneCountry,
  isoFromCountryName,
  parsePhoneNumber,
  phoneCountrySelectOptions,
} from "@/lib/phoneCountries";

type PhoneInputProps = {
  id?: string;
  label?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When set (e.g. org country "India"), dial code updates if the number is still empty. */
  linkedCountryName?: string;
  defaultIso?: string;
};

export function PhoneInput({
  id: idProp,
  label,
  value,
  onChange,
  placeholder = "Mobile or landline",
  disabled,
  className = "",
  linkedCountryName,
  defaultIso = "US",
}: PhoneInputProps) {
  const autoId = useId();
  const controlId = idProp ?? autoId;
  const countryOptions = useMemo(() => phoneCountrySelectOptions(), []);
  const userPickedCountry = useRef(false);
  const lastLinked = useRef<string | undefined>(undefined);

  const fallbackIso = useMemo(() => {
    return isoFromCountryName(linkedCountryName) || defaultIso;
  }, [linkedCountryName, defaultIso]);

  const parsed = useMemo(() => parsePhoneNumber(value, fallbackIso), [value, fallbackIso]);
  const [iso2, setIso2] = useState(parsed.iso2);
  const [national, setNational] = useState(parsed.national);

  useEffect(() => {
    const next = parsePhoneNumber(value, fallbackIso);
    setIso2(next.iso2);
    setNational(next.national);
  }, [value, fallbackIso]);

  useEffect(() => {
    if (!linkedCountryName || userPickedCountry.current) return;
    const iso = isoFromCountryName(linkedCountryName);
    if (!iso) return;
    if (lastLinked.current === linkedCountryName) return;
    lastLinked.current = linkedCountryName;
    if (!national.trim()) {
      setIso2(iso);
    }
  }, [linkedCountryName, national]);

  const emit = (nextIso: string, nextNational: string) => {
    onChange(formatE164(nextIso, nextNational));
  };

  const meta = getPhoneCountry(iso2);
  const dialDisplay = meta ? `+${meta.dial}` : "+…";

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={`${controlId}-national`} className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
        </label>
      ) : null}
      <div className="flex gap-2 items-stretch">
        <div className="shrink-0 w-[10.5rem] min-w-0">
          <AsyncSearchSelect
            compact
            value={iso2}
            onChange={(v) => {
              userPickedCountry.current = true;
              setIso2(v);
              emit(v, national);
            }}
            disabled={disabled}
            staticOptions={countryOptions}
            placeholder={`${flagEmoji(iso2)} ${dialDisplay}`}
            searchPlaceholder="Country or code…"
            allowCustom={false}
            pageSize={8}
          />
        </div>
        <h3 className="sr-only" id={`${controlId}-hint`}>
          Enter number without country code; selected code is {dialDisplay}
        </h3>
        <input
          id={`${controlId}-national`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          disabled={disabled}
          value={national}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d\s\-()]/g, "");
            setNational(digits);
            emit(iso2, digits);
          }}
          placeholder={placeholder}
          aria-describedby={`${controlId}-hint`}
          className="flex-1 min-w-0 text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
        />
      </div>
    </div>
  );
}