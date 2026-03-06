import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.warn("[supabase-server] NEXT_PUBLIC_SUPABASE_URL is missing or undefined");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("[supabase-server] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or undefined");
  }
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
  if (!process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[supabase-server] NEXT_SUPABASE_SERVICE_ROLE_KEY is missing or undefined");
  }
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
