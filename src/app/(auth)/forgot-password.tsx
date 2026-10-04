import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { font } from "@/theme";

/**
 * Account recovery with a 6-digit email code (no deep-link setup required).
 * The Supabase "Reset password" email template must include {{ .Token }} — see README.
 */
export default function ForgotPassword() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) return setError(error.message);
    setStep("code");
  };

  const reset = async () => {
    setError(null);
    if (!/^\d{6,10}$/.test(code.trim())) return setError("Enter the code from the email");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
    if (error) { setBusy(false); return setError(error.message); }
    const { error: upErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (upErr) return setError(upErr.message);
    router.replace("/");
  };

  return (
    <Screen>
      <Text style={font.h1} accessibilityRole="header">Reset password</Text>
      {error && <Notice tone="danger">{error}</Notice>}
      {step === "email" ? (
        <>
          <Text style={font.small}>We'll email you a one-time code.</Text>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Send code" onPress={sendCode} loading={busy} />
        </>
      ) : (
        <>
          <Notice>If an account exists for {email.trim()}, a code is on its way.</Notice>
          <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Button title="Set new password" onPress={reset} loading={busy} />
          <Button title="Resend code" variant="ghost" onPress={sendCode} />
        </>
      )}
    </Screen>
  );
}
