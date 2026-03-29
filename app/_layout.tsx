import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PostHogProvider } from "posthog-react-native";
import { BG } from "../constants/theme";

export default function RootLayout() {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  const root = (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: BG },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="preview" />
        <Stack.Screen name="report" />
      </Stack>
    </>
  );

  if (!apiKey) {
    if (__DEV__) {
      console.warn(
        "[PostHog] EXPO_PUBLIC_POSTHOG_API_KEY is missing; analytics provider disabled."
      );
    }
    return root;
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      options={
        {
          host: "https://eu.i.posthog.com",
          capture_pageview: true,
          enable_session_replay: true,
        } as any
      }
    >
      {root}
    </PostHogProvider>
  );
}
