import { redirect } from 'next/navigation';

/**
 * The middleware already redirects `/` to /dashboard or /login based on the
 * session cookie; this is the fallback for any path that slips through.
 */
export default function HomePage() {
  redirect('/dashboard');
}
