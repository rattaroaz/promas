import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearUndoScope,
  mountUndoDeleteKeys,
  pushUndoDelete,
  resetUndoDeletesForTests,
  subscribeUndoDeletes,
  undoDeleteCount,
  undoLastDelete,
} from "./undoDelete";

afterEach(() => resetUndoDeletesForTests());

describe("undoDelete", () => {
  it("undoes the most recent delete first and notifies listeners", async () => {
    const order: string[] = [];
    const listener = vi.fn();
    const unsubscribe = subscribeUndoDeletes(listener);
    pushUndoDelete(() => void order.push("a"));
    pushUndoDelete(() => void order.push("b"));
    expect(undoDeleteCount()).toBe(2);
    await undoLastDelete();
    expect(order).toEqual(["b"]);
    expect(undoDeleteCount()).toBe(1);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("does nothing when the stack is empty", async () => {
    await expect(undoLastDelete()).resolves.toBeUndefined();
    expect(undoDeleteCount()).toBe(0);
  });

  it("puts the entry back when undo throws", async () => {
    pushUndoDelete(() => {
      throw new Error("nope");
    });
    await expect(undoLastDelete()).rejects.toThrow("nope");
    expect(undoDeleteCount()).toBe(1);
  });

  it("ignores a second undo while one is running", async () => {
    let release!: () => void;
    const first = vi.fn(() => new Promise<void>((r) => (release = r)));
    const second = vi.fn();
    pushUndoDelete(second);
    pushUndoDelete(first);
    const pending = undoLastDelete();
    await undoLastDelete();
    expect(second).not.toHaveBeenCalled();
    release();
    await pending;
    expect(first).toHaveBeenCalledOnce();
  });

  it("drops only the entries of a cleared scope", () => {
    pushUndoDelete(() => {}, "form");
    pushUndoDelete(() => {});
    clearUndoScope("form");
    expect(undoDeleteCount()).toBe(1);
    clearUndoScope("missing");
    expect(undoDeleteCount()).toBe(1);
  });

  it("F2 undoes once mounted and stops after unmount", async () => {
    const undo = vi.fn();
    const unmountA = mountUndoDeleteKeys();
    const unmountB = mountUndoDeleteKeys();
    pushUndoDelete(undo);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", ctrlKey: true }));
    expect(undo).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F2" }));
    await Promise.resolve();
    expect(undo).toHaveBeenCalledOnce();
    unmountA();
    unmountB();
    pushUndoDelete(undo);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F2" }));
    await Promise.resolve();
    expect(undo).toHaveBeenCalledOnce();
  });
});
