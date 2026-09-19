import concurrentPut from "../examples/concurrent-put.json";
import duplicates from "../examples/duplicates.json";
import fanOut from "../examples/fan-out.json";
import observedRemove from "../examples/observed-remove.json";
import partitionHeal from "../examples/partition-heal.json";
import threeReplicaDrop from "../examples/three-replica-drop.json";

/** A ready-made run a visitor can start with one click. */
export type Story = Readonly<{
  id: string;
  name: string;
  promise: string;
  source: string;
  scenario: unknown;
  recommended?: boolean;
}>;

export const STORIES: readonly Story[] = [
  {
    id: "partition-heal",
    name: "분할 → 복구",
    promise: "한쪽이 끊긴 사이에 쓴 값이, 복구하면 반대편에도 도착합니다. 패킷 25% 손실·50% 중복을 견딥니다.",
    source: "examples/partition-heal.json",
    scenario: partitionHeal,
    recommended: true,
  },
  {
    id: "concurrent-put",
    name: "동시 쓰기 보존",
    promise: "두 복제본이 같은 키를 동시에 씁니다. 마지막 쓰기가 이기는 대신 두 값이 모두 남습니다.",
    source: "examples/concurrent-put.json",
    scenario: concurrentPut,
  },
  {
    id: "observed-remove",
    name: "관찰된 제거",
    promise: "지운 값은 사라지고, 지운 뒤 다른 복제본이 쓴 값은 살아남습니다.",
    source: "examples/observed-remove.json",
    scenario: observedRemove,
  },
  {
    id: "duplicates",
    name: "중복 도착",
    promise: "모든 메시지가 두 번씩 도착합니다. 그래도 상태는 한 번 받은 것과 같습니다.",
    source: "examples/duplicates.json",
    scenario: duplicates,
  },
  {
    id: "fan-out",
    name: "5복제본 전파",
    promise: "한 번의 쓰기가 다섯 복제본으로 퍼집니다. 한 링크가 끊겨 있어도 복구 후 모두 같은 값입니다.",
    source: "examples/fan-out.json",
    scenario: fanOut,
  },
  {
    id: "three-replica-drop",
    name: "3복제본 + 패킷 손실",
    promise: "셋이 각자 다르게 읽던 상태가, 복구 후에는 모두 같은 값으로 모입니다.",
    source: "examples/three-replica-drop.json",
    scenario: threeReplicaDrop,
  },
];
