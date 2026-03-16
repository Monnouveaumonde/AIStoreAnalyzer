import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader = async (_request: LoaderFunctionArgs["request"]) => {
  return json({ status: "ok", timestamp: new Date().toISOString() });
};
