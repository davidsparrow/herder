import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options);
          } catch { }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, "", { ...options, maxAge: 0 });
          } catch { }
        },
      },
    }
  );
}

export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() {
          return undefined;
        },
        set() { },
        remove() { },
      },
    }
  );
}
