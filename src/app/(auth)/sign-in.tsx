import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, font } from "@/theme";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address");
    if (!password) return setError("Enter your password");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Email or password is incorrect" : error.message);
    // Navigation happens automatically in the root gate once the session exists.
  };

  return (
    <Screen>
      <Text style={font.h1} accessibilityRole="header">Welcome back</Text>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      <Button title="Sign in" onPress={submit} loading={busy} />
      <Pressable onPress={() => router.push("/forgot-password")} accessibilityRole="link" hitSlop={10}>
        <Text style={{ color: colors.primary, textAlign: "center", fontWeight: "600" }}>Forgot password?</Text>
      </Pressable>
    </Screen>
  );
}
