"use client";

import React, { useId, useMemo, useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import {
  getPasswordStrength,
  getPasswordSuggestions,
  PASSWORD_REQUIREMENTS,
  strengthBarWidth,
  strengthDisplay,
} from "@/lib/passwordStrength";
import { fieldPlaceholder } from "@/lib/formPlaceholders";

type PasswordInputProps = {
  id?: string;
  label?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  showStrength?: boolean;
  showRequirementsInfo?: boolean;
  className?: string;
  autoComplete?: string;
  /** Larger fields for login / public auth screens */
  size?: "sm" | "md";
  inputClassName?: string;
};

export function PasswordInput({
  id: idProp,
  label,
  value,
  onChange,
  placeholder = fieldPlaceholder.password,
  required,
  minLength,
  disabled,
  showStrength = true,
  showRequirementsInfo = true,
  className = "",
  autoComplete = "new-password",
  size = "sm",
  inputClassName = "",
}: PasswordInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const infoId = `${id}-requirements`;
  const [visible, setVisible] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const strength = useMemo(() => getPasswordStrength(value), [value]);
  const meta = strengthDisplay[strength];
  const suggestions = useMemo(() => getPasswordSuggestions(value), [value]);

  return (
    <div className={className}>
      {label !== undefined && (
        <div className="flex items-center gap-1.5 mb-1">
          <label htmlFor={id} className="text-xs font-semibold text-slate-700">
            {label}
          </label>
          {showRequirementsInfo && (
            <span className="relative inline-flex">
              <button
                type="button"
                onClick={() => setInfoOpen((o) => !o)}
                className="p-0.5 text-slate-400 hover:text-teal-600 rounded-md transition"
                aria-label="Password requirements"
                aria-expanded={infoOpen}
                aria-describedby={infoOpen ? infoId : undefined}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              {infoOpen && (
                <div
                  id={infoId}
                  role="tooltip"
                  className="absolute left-0 top-full z-30 mt-1 w-56 p-2.5 bg-white border border-slate-200 rounded-lg shadow-lg text-[10px] text-slate-600 leading-relaxed"
                >
                  <p className="font-bold text-slate-800 mb-1 uppercase tracking-wide text-[9px]">
                    Password requirements
                  </p>
                  <ul className="list-disc pl-3.5 space-y-0.5">
                    {PASSWORD_REQUIREMENTS.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </span>
          )}
        </div>
      )}
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          disabled={disabled}
          autoComplete={autoComplete}
          suppressHydrationWarning
          className={
            size === "md"
              ? `w-full px-3 py-2.5 pl-3 pr-11 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/80 focus:border-blue-400 bg-white transition ${inputClassName}`
              : `w-full text-xs py-2 pl-3 pr-9 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition ${inputClassName}`
          }
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className={
            size === "md"
              ? "absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500/80"
              : "absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1 text-slate-400 hover:text-slate-600 rounded-md"
          }
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
          ) : (
            <Eye className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
          )}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div className="mt-1.5 space-y-1">
          <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${meta.barClass} ${strengthBarWidth(strength)}`}
            />
          </div>
          <p className={`text-[10px] font-semibold ${meta.textClass}`}>
            Password strength: {meta.label || "—"}
          </p>
          {suggestions.length > 0 && (
            <ul className="text-[10px] text-slate-500 space-y-0.5 list-disc pl-3.5">
              {suggestions.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}