import * as Y from "yjs";
import { ContractError, utf8Length } from "../crdt.js";
import { identifier, objectOf, ownJson } from "../verify/json.js";
import type {
  Context,
  Manifest,
  ModelAdapter,
  Outgoing,
} from "../verify/types.js";

type State = { doc: Y.Doc; clientID: number };
export function createYjsAdapter(
  manifest: Manifest,
  replicas: readonly string[],
): ModelAdapter<State> {
  const active = new Set<number>();
  const emit = (
    data: Uint8Array,
    peer: string,
    context: Context,
  ): Outgoing => ({ to: peer, sessionId: context.sessionId, bytes: data });
  const valueOf = (input: unknown): string => {
    if (
      typeof input !== "string" ||
      !input.isWellFormed() ||
      utf8Length(input) > 4096
    )
      throw new ContractError("Yjs value must be a bounded Unicode string");
    return input;
  };
  return {
    manifest,
    create(bootstrap) {
      const source = objectOf(bootstrap, "Yjs bootstrap", [
        "clientID",
        "guid",
        "values",
      ]);
      if (
        typeof source.clientID !== "number" ||
        !Number.isSafeInteger(source.clientID) ||
        source.clientID < 0 ||
        source.clientID > 0xffff_ffff ||
        active.has(source.clientID)
      )
        throw new ContractError("Yjs clientID must be an unused uint32");
      if (
        typeof source.guid !== "string" ||
        source.guid.length < 1 ||
        utf8Length(source.guid) > 128
      )
        throw new ContractError("Yjs guid must be fixed in the bootstrap");
      const doc = new Y.Doc({ guid: source.guid });
      doc.clientID = source.clientID;
      active.add(source.clientID);
      try {
        if (source.values !== undefined)
          for (const [key, value] of Object.entries(
            objectOf(source.values, "Yjs initial values"),
          ))
            doc
              .getMap<string>("values")
              .set(identifier(key, "Yjs initial key"), valueOf(value));
        return { doc, clientID: source.clientID };
      } catch (error) {
        doc.destroy();
        active.delete(source.clientID);
        throw error;
      }
    },
    command(state, input, context) {
      const command = objectOf(input, "Yjs command");
      const key = identifier(command.key, "Yjs key");
      const map = state.doc.getMap<string>("values");
      const value =
        command.action === "put" ? valueOf(command.value) : undefined;
      if (command.action !== "put" && command.action !== "remove")
        throw new ContractError("Yjs command is not supported");
      let update: Uint8Array | undefined;
      const capture = (bytes: Uint8Array): void => {
        update = Uint8Array.from(bytes);
      };
      state.doc.on("update", capture);
      try {
        state.doc.transact(() => {
          if (command.action === "put") map.set(key, value as string);
          else map.delete(key);
        }, context.replica);
      } finally {
        state.doc.off("update", capture);
      }
      const data = update;
      return {
        outcome: "accepted",
        result: { emitted: data !== undefined },
        outgoing:
          data === undefined
            ? []
            : replicas
                .filter((peer) => peer !== context.replica)
                .map((peer) => emit(data, peer, context)),
      };
    },
    receive(state, from, _session, bytes) {
      Y.applyUpdate(state.doc, bytes, from);
      return [];
    },
    reconcile(state, peer, _session, context) {
      return [emit(Y.encodeStateAsUpdate(state.doc), peer, context)];
    },
    observe(state) {
      if (state.doc.clientID !== state.clientID)
        throw new ContractError("Yjs clientID changed during execution");
      return ownJson(state.doc.getMap("values").toJSON());
    },
    close(state) {
      state.doc.destroy();
      active.delete(state.clientID);
    },
  };
}
