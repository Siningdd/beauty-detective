import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BG } from "../constants/theme";

export default function RootLayout() {
  return (
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
}
