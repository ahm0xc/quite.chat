import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SECRET: z.string().min(1),
    CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
    CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  },

  clientPrefix: "VITE_",

  client: {
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  },

  runtimeEnv: (() => {
    if (typeof process !== "undefined") {
      return process.env;
    }
    return import.meta.env;
  })(),

  emptyStringAsUndefined: true,
});
