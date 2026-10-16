// src/kit/SearchField.tsx
import { Icon } from "./icons";

export interface SearchFieldProps {
  /** The box's name for assistive technology. */
  label: string;
  value: string;
  onInput: (text: string) => void;
  placeholder?: string;
}

/** A 44 px search box with the magnifier, as Settings' "Exact numbers" has. */
export function SearchField({ label, value, onInput, placeholder }: SearchFieldProps) {
  return (
    <label class="k-search field-box">
      <Icon name="search" size={16} />
      <input
        class="k-search__input"
        type="search"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </label>
  );
}
