export default function RoundedCloseIcon({ className = "" }) {
  const iconClassName = className ? `rounded-close-icon ${className}` : "rounded-close-icon";

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={iconClassName}>
      <path d="M5 5L15 15" />
      <path d="M15 5L5 15" />
    </svg>
  );
}
