# Diagnostic harnesses

Evidence attached to issues, not part of any test suite. They run under plain
`node`, with no build and no jest:

```
node test/glow/detached-script.js
node test/glow/stale-glow.js
```

Each one pulls single methods out of scratch-vm's own sources and drives them
directly, so a demonstration runs the real code without standing up a whole
Runtime, Target and renderer. scratch-vm is found in `node_modules`, or in a
sibling checkout of the fork. They break loudly if upstream renames a method,
which is the right behaviour for evidence: it should be re-checked against the
version it is claimed about, rather than quietly drifting.

| harness | issue | what it shows |
| --- | --- | --- |
| `detached-script.js` | glow-ets/scratch-gui#23 | A script dragged out of its hat while running cannot be stopped by clicking it, and blocks the hat from ever firing again. |
| `stale-glow.js` | glow-ets/scratch-gui#24 | A **negative** result: detach / re-attach / delete does *not* leave a glow pointing at a deleted block, so it is not the cause. Use it to try the next candidate sequence. |

Regression tests belong in `test/unit` instead — the guard added for #24 is
tested in `test/unit/util/glow-safely.test.js`.
