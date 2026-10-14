import { ContractError, Replica, type Operation } from "../crdt.js";
import { jcs, objectOf, parseJsonText, type Json } from "../verify/json.js";
import type {
  Context,
  Manifest,
  ModelAdapter,
  Outgoing,
} from "../verify/types.js";

const encoder = new TextEncoder();
function bytes(operations: readonly Operation[]): Uint8Array {
  return encoder.encode(jcs({ format: "or-map-update-v1", operations }));
}
export function createOrMapAdapter(
  manifest: Manifest,
  replicas: readonly string[],
): ModelAdapter<Replica> {
  const emit = (
    data: Uint8Array,
    peer: string,
    context: Context,
  ): Outgoing => ({ to: peer, sessionId: context.sessionId, bytes: data });
  return {
    manifest,
    create(bootstrap, context) {
      const source = objectOf(bootstrap, "OR-Map bootstrap", ["values"]);
      const state = new Replica(context.replica);
      if (source.values !== undefined) {
        for (const [key, value] of Object.entries(
          objectOf(source.values, "OR-Map initial values"),
        )) {
          if (typeof value !== "string")
            throw new ContractError("OR-Map initial values must be strings");
          state.put(key, value);
        }
      }
      return state;
    },
    command(state, input, context) {
      const command = objectOf(input, "OR-Map command");
      if (typeof command.key !== "string")
        throw new ContractError("OR-Map command key is required");
      let operation: Operation;
      if (command.action === "put" && typeof command.value === "string")
        operation = state.put(command.key, command.value);
      else if (command.action === "remove")
        operation = state.remove(command.key);
      else throw new ContractError("OR-Map command is invalid");
      const data = bytes([operation]);
      return {
        outcome: "accepted",
        result: null,
        outgoing: replicas
          .filter((peer) => peer !== context.replica)
          .map((peer) => emit(data, peer, context)),
      };
    },
    receive(state, _from, _session, data) {
      const frame = objectOf(
        parseJsonText(
          new TextDecoder("utf-8", { fatal: true }).decode(data),
          1024 * 1024,
        ),
        "OR-Map message",
        ["format", "operations"],
      );
      if (
        frame.format !== "or-map-update-v1" ||
        !Array.isArray(frame.operations)
      )
        throw new ContractError("OR-Map message format is invalid");
      for (const operation of frame.operations as readonly unknown[])
        state.apply(operation as Operation);
      return [];
    },
    reconcile(state, peer, _session, context) {
      const operations = state.operations();
      const output: Outgoing[] = [];
      let batch: Operation[] = [];
      let size = 64;
      for (const operation of operations) {
        const next = encoder.encode(jcs(operation)).length + 1;
        if (batch.length > 0 && size + next > 1024 * 1024) {
          output.push(emit(bytes(batch), peer, context));
          batch = [];
          size = 64;
        }
        batch.push(operation);
        size += next;
      }
      output.push(emit(bytes(batch), peer, context));
      return output;
    },
    observe(state): Json {
      return state.canonicalState();
    },
    close() {},
  };
}
