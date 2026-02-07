/** Currency symbol used across the platform. Change here to update everywhere. */
export const C = '⌀'

/** Currency symbol rendered at 1.4em for inline use in JSX. */
export function CC() {
  return <span className="text-[1.4em] leading-none inline-block translate-y-[0.1em]">{C}</span>
}
