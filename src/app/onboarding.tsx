import { useState } from "react";
import { Text, View } from "react-native";
import { useProfile, useUpdateProfile } from "@/api/queries";
import { ProfileForm, type Section } from "@/components/ProfileForm";
import { Button, Card, ErrorState, LoadingState, Notice, Screen } from "@/components/ui";
import { colors, font, space } from "@/theme";

const STEPS: { title: string; sections: Section[] }[] = [
  { title: "Let's get to know you", sections: ["basics"] },
  { title: "Your body", sections: ["body"] },
  { title: "Your lifestyle", sections: ["lifestyle"] },
  { title: "Your daily targets", sections: ["targets"] },
];

export default function Onboarding() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const [step, setStep] = useState(0);
  const [consentStep, setConsentStep] = useState(false);

  if (profile.isLoading) return <Screen><LoadingState /></Screen>;
  if (!profile.data) return <Screen><ErrorState message="Couldn't load your profile." onRetry={() => profile.refetch()} /></Screen>;

  if (consentStep) {
    return (
      <Screen>
        <Text style={font.h1}>Privacy & photos</Text>
        <Card style={{ gap: space.sm }}>
          <Text style={font.body}>• Meal photos are stored privately in your account and sent to our AI provider (Anthropic) only to identify foods. They're not used for advertising.</Text>
          <Text style={font.body}>• Calories from photos are estimates — you confirm every item before it's saved.</Text>
          <Text style={font.body}>• You can delete any photo, your logs, or your whole account at any time in Settings.</Text>
          <Text style={font.body}>• NutriSnap provides general nutrition information, not medical advice.</Text>
        </Card>
        <Button title="Agree & enable photo recognition" loading={update.isPending}
          onPress={() => update.mutate({ ai_consent_at: new Date().toISOString(), onboarding_completed: true })} />
        <Button title="Skip — I'll log manually" variant="secondary" loading={update.isPending}
          onPress={() => update.mutate({ onboarding_completed: true })} />
        {update.error && <Notice tone="danger">{update.error.message}</Notice>}
      </Screen>
    );
  }

  const s = STEPS[step];
  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.primary : colors.surfaceAlt }} />)}
      </View>
      <Text style={font.h1} accessibilityRole="header">{s.title}</Text>
      <ProfileForm
        key={step}
        initial={profile.data}
        sections={s.sections}
        submitLabel={step === STEPS.length - 1 ? "Continue" : "Next"}
        busy={update.isPending}
        onSubmit={(patch) => update.mutate(patch, { onSuccess: () => (step === STEPS.length - 1 ? setConsentStep(true) : setStep(step + 1)) })}
      />
      {update.error && <Notice tone="danger">{update.error.message}</Notice>}
      {step > 0 && <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} />}
    </Screen>
  );
}
