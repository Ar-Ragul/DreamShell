import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface LoginScreenProps {
  onForgotPassword: () => void;
  onSignUp: () => void;
  onLoggedIn?: () => void; // optional: called after successful login
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export function LoginScreen({ onForgotPassword, onSignUp, onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data?.error || "Login failed");
      }
      // store JWT
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem("dreamshell_jwt", data.token);
      // optional: mark which storage we used
      localStorage.setItem("dreamshell_token_scope", remember ? "local" : "session");
      setLoading(false);
      onLoggedIn?.();
    } catch (e: any) {
      setLoading(false);
      setErr(e.message || "Login failed");
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-900 via-black to-zinc-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-800/50 border-zinc-700 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-white text-2xl">Welcome Back</CardTitle>
          <CardDescription className="text-zinc-400">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-zinc-500"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-zinc-500"
                required
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-700/50 text-white focus:ring-zinc-500"
                />
                <span className="text-zinc-300">Remember me</span>
              </label>
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            {err && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-md px-3 py-2">
                {err}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="text-center text-sm text-zinc-400">
            Don't have an account?{" "}
            <button
              onClick={onSignUp}
              className="text-white hover:underline cursor-pointer"
            >
              Sign up
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
