export type BuiltinTarget = Readonly<{
  id: "yjs" | "or-map";
  model: "yjs-map" | "or-map";
  label: string;
  note: string;
}>;

export const BUILTIN_TARGETS: readonly BuiltinTarget[] = [
  {
    id: "yjs",
    model: "yjs-map",
    label: "Yjs 13.6.27 map",
    note: "first real target",
  },
  {
    id: "or-map",
    model: "or-map",
    label: "built-in OR-Map",
    note: "reference target",
  },
];

export const BUILTIN_CHECKS = ["convergence", "expected-state"] as const;
