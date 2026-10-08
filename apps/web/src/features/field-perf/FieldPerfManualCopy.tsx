type FieldPerfManualCopyProps = {
  json: string;
  label: string;
};

export function FieldPerfManualCopy({ json, label }: FieldPerfManualCopyProps) {
  return (
    <label className="field-perf__fallback">
      <span className="field-perf__fallback-label">{label}</span>
      <textarea
        className="field-perf__textarea"
        readOnly
        value={json}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
      />
    </label>
  );
}
