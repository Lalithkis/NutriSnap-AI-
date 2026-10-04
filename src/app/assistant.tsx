import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAskAssistant, useAssistantHistory, useClearAssistant } from "@/api/queries";
import { Chip, ErrorState, LoadingState, Notice } from "@/components/ui";
import { deviceTimeZone } from "@/lib/dates";
import { colors, font, radius, space } from "@/theme";

const SUGGESTIONS = [
  "How many calories have I eaten today?",
  "What did I eat for lunch yesterday?",
  "How much protein do I still need today?",
  "What's my average calorie intake this week?",
  "Suggest a balanced dinner for me",
  "Compare my food intake with my activity this week",
];

export default function Assistant() {
  const history = useAssistantHistory();
  const ask = useAskAssistant();
  const clear = useClearAssistant();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const send = (msg: string) => {
    const m = msg.trim();
    if (!m || ask.isPending) return;
    setText(""); setPending(m);
    ask.mutate({ message: m, time_zone: deviceTimeZone() }, { onSettled: () => setPending(null) });
  };

  const msgs = history.data ?? [];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <Notice>Answers use your logged data. General nutrition information only — not medical advice.</Notice>
        {history.isLoading && <LoadingState />}
        {history.error && <ErrorState message={history.error.message} onRetry={() => history.refetch()} />}
        {msgs.length === 0 && !pending && (
          <View style={{ gap: space.sm }}>
            <Text style={font.h3}>Try asking</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{SUGGESTIONS.map((s) => <Chip key={s} label={s} onPress={() => send(s)} />)}</View>
          </View>
        )}
        {msgs.map((m) => <Bubble key={m.id} role={m.role} text={m.content} />)}
        {pending && <Bubble role="user" text={pending} />}
        {ask.isPending && <Text style={font.small} accessibilityLiveRegion="polite">Checking your logs…</Text>}
        {ask.error && <Notice tone="danger">{ask.error.message}</Notice>}
        {msgs.length > 0 && <Pressable onPress={() => clear.mutate()} accessibilityRole="button"><Text style={{ color: colors.textFaint, textAlign: "center" }}>Clear conversation</Text></Pressable>}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: space.sm, padding: space.md, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <TextInput value={text} onChangeText={setText} placeholder="Ask about your nutrition…" placeholderTextColor={colors.textFaint} maxLength={2000} multiline
          accessibilityLabel="Message" style={{ flex: 1, color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, maxHeight: 120, fontSize: 16 }} />
        <Pressable onPress={() => send(text)} disabled={!text.trim() || ask.isPending} accessibilityRole="button" accessibilityLabel="Send"
          style={{ width: 50, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: !text.trim() || ask.isPending ? 0.4 : 1 }}>
          <Text style={{ fontSize: 20, color: colors.onPrimary }}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const me = role === "user";
  return (
    <View style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: me ? colors.primaryDark : colors.surface, borderRadius: radius.lg, padding: space.md, borderWidth: me ? 0 : 1, borderColor: colors.border }}>
      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }} selectable>{text}</Text>
    </View>
  );
}
