import { router } from "expo-router";
import { useProfile, useUpdateProfile } from "@/api/queries";
import { ProfileForm } from "@/components/ProfileForm";
import { ErrorState, LoadingState, Notice, Screen } from "@/components/ui";

export default function Goals() {
  const profile = useProfile();
  const update = useUpdateProfile();
  if (profile.isLoading) return <Screen edges={[]}><LoadingState /></Screen>;
  if (!profile.data) return <Screen edges={[]}><ErrorState message="Couldn't load your profile." onRetry={() => profile.refetch()} /></Screen>;
  return (
    <Screen edges={[]}>
      {update.error && <Notice tone="danger">{update.error.message}</Notice>}
      <ProfileForm
        initial={profile.data}
        sections={["basics", "body", "lifestyle", "targets"]}
        submitLabel="Save changes"
        busy={update.isPending}
        onSubmit={(patch) => update.mutate(patch, { onSuccess: () => router.back() })}
      />
    </Screen>
  );
}
