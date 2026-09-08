import { auth } from "@faith-adventures/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const runtime = "nodejs";
export const { GET, POST } = toNextJsHandler(auth);
