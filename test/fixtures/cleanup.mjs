const stacks = new WeakMap();
export function cleanup(t) {
  if (!stacks.has(t)) {
    const stack = []; stacks.set(t, stack);
    t.after(async () => {
      const errors = [];
      for (const dispose of stack.reverse()) try { await dispose(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed');
    });
  }
  return dispose => stacks.get(t).push(dispose);
}
