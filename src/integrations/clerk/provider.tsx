import { ClerkProvider } from "@clerk/tanstack-react-start";
import type { ReactNode } from "react";

export default function AppClerkProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
