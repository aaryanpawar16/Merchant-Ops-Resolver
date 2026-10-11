// A labelled on/off switch. The real control is a checkbox, so it works with the keyboard and screen readers.
export function Toggle({
  checked,
  onChange,
  title,
  detail,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-[2px] border border-line bg-black/30 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:bg-mute after:transition-all peer-checked:border-lime peer-checked:after:translate-x-4 peer-checked:after:bg-lime peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lime"
      />
      <span>
        <span className="label block">{title}</span>
        <span className="mt-1 block text-[13px] leading-snug text-mute">{detail}</span>
      </span>
    </label>
  );
}
