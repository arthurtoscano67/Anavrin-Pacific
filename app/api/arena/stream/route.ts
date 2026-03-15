import { currentArenaState, subscribeArena } from "@/server/arena-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (type: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      };

      emit("snapshot", currentArenaState());

      const unsubscribe = subscribeArena((snapshot) => {
        emit("snapshot", snapshot);
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
