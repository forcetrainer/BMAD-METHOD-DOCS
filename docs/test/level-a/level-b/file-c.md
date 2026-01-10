---
title: File C
description: Test file at level-c (three levels deep)
---

# File C

This file is three levels deep: `test/level-a/level-b/level-c/file-c.md`

## The Deepest Level

This is the deepest file in the test structure. It demonstrates that relative paths work even at deep nesting levels.

## Navigation Links

### Parent Link (Up One)

- [File B](./file-b.md) - Direct parent

### Grandparent Links (Up Two)

- [File A](../file-a.md) - Two levels up
- [Sibling A](./level-c/sibling-a.md) - Another file two levels up

### Great-Grandparent Links (Up Three)

- [Test Index](./index.md) - All the way back to test root
- [Alpha File](./level-c/alpha.md) - Sibling of test root

## Anchor Links

- [File B Navigation](./file-b.md#navigation-links) - Anchor in parent
- [File A Features](../file-a.md#features) - Anchor two levels up
- [Index Same Level Links](./index.md#same-level-links-siblings) - Anchor three levels up

## Summary

This file tests the full range of relative path navigation:
- `../` - one level up
- `../../` - two levels up
- `../../../` - three levels up
