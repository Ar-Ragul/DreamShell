import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useState } from "react";

interface SignUpScreenProps {
  onBackToLogin: () => void;
}

export function SignUpScreen({ onBackToLogin }: SignUpScreenProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords don't match!");
      return;
    }
    // Handle sign up logic here
    console.log("Sign up attempted with:", formData);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-900 via-black to-zinc-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-800/50 border-zinc-700 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-white text-2xl">Create Account</CardTitle>
          <CardDescription className="text-zinc-400">
            Enter your information to create a new account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white">
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-zinc-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-zinc-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-zinc-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-zinc-500"
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="terms"
                className="rounded border-zinc-600 bg-zinc-700/50 text-white focus:ring-zinc-500"
                required
              />
              <Label htmlFor="terms" className="text-sm text-zinc-300">
                I agree to the{" "}
                <a href="#" className="text-white hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="text-white hover:underline">
                  Privacy Policy
                </a>
              </Label>
            </div>
            <Button
              type="submit"
              className="w-full bg-white text-black hover:bg-zinc-200 transition-colors"
            >
              Create Account
            </Button>
          </form>
          <div className="text-center text-sm text-zinc-400">
            Already have an account?{" "}
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