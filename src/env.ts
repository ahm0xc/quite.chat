import { z } from "zod";

const clientSchema = z.object({
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  VITE_PUSHER_KEY: z.string().min(1),
  VITE_PUSHER_CLUSTER: z.string().min(1),
});

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  PUSHER_APP_ID: z.string().min(1),
  PUSHER_SECRET: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
});

const isClient = typeof window !== "undefined";

const clientEnv = clientSchema.parse({
  VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_PUSHER_KEY: import.meta.env.VITE_PUSHER_KEY,
  VITE_PUSHER_CLUSTER: import.meta.env.VITE_PUSHER_CLUSTER,
});

const serverEnv = isClient ? undefined : serverSchema.parse(process.env);

export const env = {
  ...serverEnv,
  ...clientEnv,
} as z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;
