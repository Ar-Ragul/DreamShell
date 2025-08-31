// src/components/Protected.tsx
import { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Protected({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center text-zinc-300">
        Checking session…
      </div>
    );
  }

  if (!user) {
    // You can render your LoginScreen here directly or redirect using a router.
    return <div className="min-h-screen grid place-items-center text-zinc-300">Please sign in.</div>;
  }

  // Optional: block unverified accounts
  // if (!user.verified) return <div className="min-h-screen grid place-items-center">Check your email to verify.</div>;

  return <>{children}</>;
}
