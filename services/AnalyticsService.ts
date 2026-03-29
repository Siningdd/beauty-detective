import { PostHog } from "posthog-react-native";
import {
  getActiveAnalysisSessionId,
  getLastAnalyzedImage,
  getPendingImage,
  getReportMeta,
} from "./store";

type CaptureProps = Record<string, unknown>;
type QuerySource = "chip" | "manual";
type IngredientAction = "add" | "edit" | "delete";

function readSessionId(): number | null {
  const pending = getPendingImage()?.sessionId;
  if (typeof pending === "number" && Number.isFinite(pending) && pending > 0) {
    return pending;
  }
  const last = getLastAnalyzedImage()?.sessionId;
  if (typeof last === "number" && Number.isFinite(last) && last > 0) {
    return last;
  }
  const reportSession = getReportMeta()?.sessionId;
  if (
    typeof reportSession === "number" &&
    Number.isFinite(reportSession) &&
    reportSession > 0
  ) {
    return reportSession;
  }
  const activeSession = getActiveAnalysisSessionId();
  if (
    typeof activeSession === "number" &&
    Number.isFinite(activeSession) &&
    activeSession > 0
  ) {
    return activeSession;
  }
  return null;
}

export class AnalyticsService {
  private static client: PostHog | null = null;

  private static getClient(): PostHog | null {
    if (AnalyticsService.client) return AnalyticsService.client;
    const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    if (!apiKey) return null;
    try {
      AnalyticsService.client = new PostHog(apiKey, {
        host: "https://eu.i.posthog.com",
      } as any);
      return AnalyticsService.client;
    } catch {
      return null;
    }
  }

  private static capture(event: string, props: CaptureProps): void {
    try {
      const client = AnalyticsService.getClient();
      if (!client) return;
      const sessionId = readSessionId();
      const payload: CaptureProps = {
        ...props,
        ...(sessionId != null ? { sessionId } : {}),
      };
      if (__DEV__) {
        console.log("[AnalyticsService.capture]", { event, payload });
      }
      client.capture(event, payload as any);
    } catch {
      // Never block product flow if analytics fails.
    }
  }

  static trackIngredientModified(
    action: IngredientAction,
    original_name?: string,
    new_name?: string,
    product_category?: string
  ): void {
    AnalyticsService.capture("Ingredient_Modified", {
      action,
      original_name: original_name?.trim() || undefined,
      new_name: new_name?.trim() || undefined,
      product_category: product_category?.trim() || undefined,
    });
  }

  static trackCategoryCorrected(
    detected_type: string,
    selected_type: string
  ): void {
    AnalyticsService.capture("Category_Corrected", {
      detected_type: detected_type?.trim() || undefined,
      selected_type: selected_type?.trim() || undefined,
    });
  }

  static trackQuerySubmitted(
    source: QuerySource,
    content: string,
    category: string
  ): void {
    AnalyticsService.capture("Query_Submitted", {
      source,
      content: content?.trim() || undefined,
      category: category?.trim() || undefined,
    });
  }
}
