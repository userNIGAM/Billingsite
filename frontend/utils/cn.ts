/**
 * Minimal class-name joiner. Deliberately not `clsx`/`tailwind-merge`: this
 * app has no dynamic conflicting-class needs, and keeping the dependency
 * surface tiny matters for a small canteen deployment.
 *
 * Filters out false/null/undefined so conditional classes read naturally:
 *   cn('base', isOpen && 'open', variant === 'danger' && 'bg-red-600')
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
