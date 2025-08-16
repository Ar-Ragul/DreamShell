import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle forgot password logic here
    console.log("Password reset requested for:", email);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-zinc-900 via-black to-zinc-950 text-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-zinc-800/50 border-zinc-700 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-white text-2xl">Check Your Email</CardTitle>
            <CardDescription className="text-zinc-400">
              We've sent a password reset link to your email address
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-700/50 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-zinc-300 text-sm">
                Didn't receive the email? Check your spam folder or{" "}
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="text-white hover:underline"
                >
                  try again
                </button>
              </p>
            </div>
            <Button
              onClick={onBackToLogin}
              className="w-full bg-zinc-700/50 text-white hover:bg-zinc-600/50 transition-colors"
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-900 via-black to-zinc-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-800/50 border-zinc-700 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center space-x-2 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToLogin}
              className="text-zinc-400 hover:text-white hover:bg-zinc-700/50 p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="text-zinc-400 text-sm">Back to login</span>
          </div>
          <CardTitle className="text-white text-2xl">Reset Password</CardTitle>
          <CardDescription className="text-zinc-400">
            Enter your email address and we'll send you a link to reset your password
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-zinc-500"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-white text-black hover:bg-zinc-200 transition-colors"
            >
              Send Reset Link
            </Button>
          </form>
          <div className="text-center text-sm text-zinc-400">
            Remember your password?{" "}
            <button
              onClick={onBackToLogin}
              className="text-white hover:underline cursor-pointer"
            >
              Sign in
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}