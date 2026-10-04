import { useState } from "react";
import { Text } from "react-native";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { font } from "@/theme";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Tell us what to call you");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim().slice(0, 60) } } });
    setBusy(false);
    if (error) return setError(error.message);
    if (!data.session) setInfo("Check your inbox to confirm your email, then sign in.");
  };

  return (
    <Screen>
      <Text style={font.h1} accessibilityRole="header">Create your account</Text>
      {error && <Notice tone="danger">{error}</Notice>}
      {info && <Notice>{info}</Notice>}
      <Field label="Display name" value={name} onChangeText={setName} autoComplete="name" maxLength={60} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="At least 8 characters" />
      <Text style={font.tiny}>
        By continuing you agree that NutriSnap stores your food, activity and body data to provide the service. You can export or delete it anytime in Settings.
      </Text>
      <Button title="Create account" onPress={submit} loading={busy} />
    </Screen>
  );
}
