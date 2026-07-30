/**
 * Runtime env access with clear failure messages. Public values are inlined by Next
 * at build time; server values are read at request time only.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy apps/web/.env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Public config — safe in the browser. */
export const publicEnv = {
  get supabaseUrl(): string {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey(): string {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get siteUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  },
};

/** Server-only config — throws if these ever leak into a client bundle context. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get paystackSecretKey(): string {
    return required('PAYSTACK_SECRET_KEY', process.env.PAYSTACK_SECRET_KEY);
  },
  get gitSha(): string {
    return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? 'dev';
  },
};
