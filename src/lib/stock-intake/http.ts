import { z } from "zod";

export function intakeErrorResponse(error: unknown): Response {
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  const message = error instanceof Error ? error.message : "";
  if (message === "Sign in required")
    return Response.json({ error: message }, { status: 401 });
  if (message === "Permission denied")
    return Response.json({ error: message }, { status: 403 });
  return Response.json(
    {
      error:
        "Receipt service unavailable. Your saved work is retained; refresh its status before retrying.",
    },
    { status: 503 },
  );
}
