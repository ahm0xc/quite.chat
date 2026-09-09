import * as React from "react";

type SecondaryPanelContextProps = {
  currentView: string | null;
  viewProps: Record<string, unknown>;
  setView: (view: string, props?: Record<string, unknown>) => void;
  close: () => void;
};

const SecondaryPanelContext =
  React.createContext<SecondaryPanelContextProps | null>(null);

export function SecondaryPanelProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentView, setCurrentView] = React.useState<string | null>(null);
  const [viewProps, setViewProps] = React.useState<Record<string, unknown>>({});

  const setView = React.useCallback(
    (view: string, props?: Record<string, unknown>) => {
      setCurrentView(view);
      setViewProps(props ?? {});
    },
    [],
  );

  const close = React.useCallback(() => {
    setCurrentView(null);
    setViewProps({});
  }, []);

  return (
    <SecondaryPanelContext.Provider
      value={{ currentView, viewProps, setView, close }}
    >
      {children}
    </SecondaryPanelContext.Provider>
  );
}

export function useSecondaryPanel() {
  const context = React.useContext(SecondaryPanelContext);
  if (!context) {
    throw new Error(
      "useSecondaryPanel must be used within a SecondaryPanelProvider.",
    );
  }
  return context;
}
