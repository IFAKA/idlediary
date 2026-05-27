"use client";

import {
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { easeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type AppHeaderConfig = {
  eyebrow: ReactNode;
  title: ReactNode;
  titleAs?: "h1" | "h2";
  leading?: ReactNode;
  trailing?: ReactNode;
};

type HeaderOwner = symbol;

type AppHeaderContextValue = {
  clearHeaderConfig: (owner: HeaderOwner) => void;
  setHeaderConfig: (owner: HeaderOwner, config: AppHeaderConfig) => void;
};

const AppHeaderContext = createContext<AppHeaderContextValue | null>(null);

export function AppHeaderProvider({ children }: { children: ReactNode }) {
  const [headerConfig, setHeaderConfigState] = useState<AppHeaderConfig | null>(
    null,
  );
  const currentOwner = useRef<HeaderOwner | null>(null);

  const contextValue = useMemo<AppHeaderContextValue>(
    () => ({
      setHeaderConfig(owner, config) {
        currentOwner.current = owner;
        setHeaderConfigState(config);
      },
      clearHeaderConfig(owner) {
        if (currentOwner.current !== owner) return;
        currentOwner.current = null;
        setHeaderConfigState(null);
      },
    }),
    [],
  );

  return (
    <AppHeaderContext.Provider value={contextValue}>
      {children}
      <MorphingAppHeader config={headerConfig} />
    </AppHeaderContext.Provider>
  );
}

export function useAppHeader(config: AppHeaderConfig) {
  const context = useContext(AppHeaderContext);
  const owner = useRef<HeaderOwner>(Symbol("app-header-owner"));

  useLayoutEffect(() => {
    if (!context) return;
    const currentOwner = owner.current;
    context.setHeaderConfig(currentOwner, config);

    return () => context.clearHeaderConfig(currentOwner);
  }, [config, context]);
}

function MorphingAppHeader({ config }: { config: AppHeaderConfig | null }) {
  return (
    <div
      aria-hidden={!config}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 px-[max(16px,env(safe-area-inset-left))] pt-[max(16px,env(safe-area-inset-top))]"
    >
      <motion.header
        className="mx-auto grid min-h-16 w-full max-w-5xl grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-start gap-4"
        layout
        transition={easeOut}
      >
        <HeaderActionSlot action={config?.leading} side="leading" />
        <div className="min-w-0 pt-0.5">
          <AnimatePresence initial={false} mode="popLayout">
            {config ? (
              <motion.div
                key={`${nodeKey(config.eyebrow, "eyebrow")}:${nodeKey(config.title, "title")}`}
                animate={{ opacity: 1, y: 0 }}
                className="min-w-0"
                exit={{ opacity: 0, y: -4 }}
                initial={{ opacity: 0, y: 4 }}
                transition={easeOut}
              >
                <motion.p
                  className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-primary"
                  layout
                >
                  {config.eyebrow}
                </motion.p>
                <HeaderTitle config={config} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <HeaderActionSlot action={config?.trailing} side="trailing" />
      </motion.header>
    </div>
  );
}

function HeaderTitle({ config }: { config: AppHeaderConfig }) {
  const Title = config.titleAs ?? "h1";

  return (
    <Title className="mt-1 truncate text-2xl font-semibold leading-tight">
      {config.title}
    </Title>
  );
}

function HeaderActionSlot({
  action,
  side,
}: {
  action: ReactNode;
  side: "leading" | "trailing";
}) {
  return (
    <motion.div
      className={cn(
        "flex size-14 items-start",
        side === "leading" ? "justify-start" : "justify-end",
      )}
      layout
      transition={easeOut}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {action ? (
          <motion.div
            key={nodeKey(action, side)}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-auto"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={{ opacity: 0, scale: 0.96 }}
            transition={easeOut}
          >
            {action}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function nodeKey(node: ReactNode, fallback: string): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (isValidElement(node)) {
    if (node.key) return String(node.key);
    const props = node.props as { "aria-label"?: unknown; children?: ReactNode };
    if (typeof props["aria-label"] === "string") return props["aria-label"];
    const text = textFromNode(props.children);
    if (text) return `${fallback}:${text}`;
    return `${fallback}:${elementTypeName(node.type)}`;
  }

  return fallback;
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).filter(Boolean).join(" ");
  }

  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return textFromNode(props.children);
  }

  return "";
}

function elementTypeName(type: unknown): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") {
    const namedType = type as { displayName?: string; name?: string };
    return namedType.displayName ?? namedType.name ?? "component";
  }
  return "component";
}
