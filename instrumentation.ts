// Next.js calls register() once when a server instance starts, before it takes requests.
// This is where the neatlogs SDK is initialised: once per process, never inside a request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.NEATLOGS_API_KEY) return;

  try {
    const { init } = await import("neatlogs");
    await init({
      apiKey: process.env.NEATLOGS_API_KEY,
      // Names the task this process performs. The project is chosen by the API key.
      workflowName: "resolve-merchant-case",
      endpoint: process.env.NEATLOGS_ENDPOINT ?? "https://ingest.neatlogs.com",
    });
  } catch (error) {
    // Tracing must never stop the app from serving.
    console.error("[neatlogs] init failed, tracing is off:", error);
  }
}
