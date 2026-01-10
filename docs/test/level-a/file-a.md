---
title: File A
description: Test file at level-a (one level deep)
---

# File A

This file is one level deep in the test structure: `test/level-a/file-a.md`

## Features

This section exists to test anchor links from other files.

## Navigation Links

### Parent Links (One Level Up)

- [Test Index](../../index.md) - Back to test root
- [Alpha File](./level-b/level-c/alpha.md) - Sibling of test root

### Sibling Links (Same Level)

- [Sibling A](./level-b/level-c/sibling-a.md) - File at same level

### Child Links (One Level Down)

- [File B](./level-b/file-b.md) - Into level-b directory
- [File C](./level-b/file-c.md) - Deep into level-c

## Anchor Links

- [Alpha Links to Siblings](./level-b/level-c/alpha.md#links-to-siblings) - Anchor in parent level
- [File B Up Links](./level-b/file-b.md#parent-links-up) - Anchor in child
