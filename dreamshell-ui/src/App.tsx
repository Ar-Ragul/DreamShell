// src/App.tsx
import { useState } from "react";
import Protected from "./components/Protected";
import { LoginScreen } from "./components/LoginScreen";
import { SignUpScreen } from "./components/SignUpScreen";
import DreamshellTerminal from "./DreamshellTerminal";
import { useAuth } from "./hooks/useAuth";

type View = "login" | "signup" | "terminal";

export default function App() {
  const [view, setView] = useState<View>("login");
  const { user } = useAuth();

  if (user && view !== "terminal") setView("terminal");

  if (view === "signup") {
    return (
      <SignUpScreen
        onBackToLogin={() => setView("login")}
        onRegistered={() => setView("login")}
      />
    );
  }

  if (view === "login" && !user) {
    return (
      <LoginScreen
        onSignUp={() => setView("signup")}
        onForgotPassword={() => alert("TODO: open forgot password screen")}
        onLoggedIn={() => setView("terminal")}
      />
    );
  }

  return (
    <Protected>
      <DreamshellTerminal />
    </Protected>
  );
}
