import { useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { SignUpScreen } from "./components/SignUpScreen";
import { ForgotPasswordScreen } from "./components/ForgotPasswordScreen";
import './index.css';

type AuthScreen = "login" | "signup" | "forgot-password";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AuthScreen>("login");

  const showLogin = () => setCurrentScreen("login");
  const showSignUp = () => setCurrentScreen("signup");
  const showForgotPassword = () => setCurrentScreen("forgot-password");

  switch (currentScreen) {
    case "signup":
      return <SignUpScreen onBackToLogin={showLogin} />;
    case "forgot-password":
      return <ForgotPasswordScreen onBackToLogin={showLogin} />;
    default:
      return (
        <LoginScreen 
          onForgotPassword={showForgotPassword} 
          onSignUp={showSignUp} 
        />
        
      );
  }
}