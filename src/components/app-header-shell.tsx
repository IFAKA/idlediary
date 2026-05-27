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
        className="mx-auto flex min-h-16 w-full max-w-5xl items-start"
        layout
        layoutRoot
        transition={easeOut}
      >
        <AnimatePresence initial={false}>
          {config?.leading ? (
            <HeaderActionSlot
              key={nodeKey(config.leading, "leading")}
              action={config.leading}
              side="leading"
            />
          ) : null}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {config ? (
            <motion.div
              key="title"
              className="min-w-0 flex-1 pt-0.5"
              layout
              transition={easeOut}
            >
              <AnimatePresence initial={false} mode="popLayout">
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
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {config?.trailing ? (
            <HeaderActionSlot
              key={nodeKey(config.trailing, "trailing")}
              action={config.trailing}
              side="trailing"
            />
          ) : null}
        </AnimatePresence>
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
  const isTrailing = side === "trailing";
  const slotWidth = isTrailing ? 84 : 56;
  const slotMarginLeft = isTrailing ? 16 : 0;
  const slotMarginRight = side === "leading" ? 16 : 0;
  const hiddenSlotLayout = isTrailing
    ? {
        marginLeft: slotMarginLeft,
        marginRight: slotMarginRight,
        scale: 1,
        width: slotWidth,
      }
    : {
        marginLeft: 0,
        marginRight: 0,
        scale: 0.96,
        width: 0,
      };

  return (
    <motion.div
      animate={{
        marginLeft: slotMarginLeft,
        marginRight: slotMarginRight,
        opacity: 1,
        scale: 1,
        width: slotWidth,
      }}
      className={cn(
        "pointer-events-auto flex h-14 shrink-0 items-start overflow-hidden",
        side === "leading" ? "justify-start" : "justify-end",
      )}
      exit={{
        ...hiddenSlotLayout,
        opacity: 0,
      }}
      initial={{
        ...hiddenSlotLayout,
        opacity: 0,
      }}
      transition={easeOut}
    >
      {action}
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
