---
title: Link Test Index
description: Root test file for validating relative links
---

# Link Test Index

This is the root of the link test directory. It contains links to files at various depths to validate that relative paths work across all three environments:

1. **Local IDE** - Clicking links in VS Code, Cursor, etc.
2. **Astro/Starlight** - The built documentation site
3. **GitHub** - Browsing the repo online

## Same Level Links (Siblings)

- [Alpha File](./level-c/alpha.md) - A sibling file at the same level

## Child Links (One Level Down)

- [File A](../file-a.md) - File one level deep
- [Sibling A](./level-c/sibling-a.md) - Another file one level deep

## Deep Links (Multiple Levels Down)

- [File B](./file-b.md) - File two levels deep
- [File C](./file-c.md) - File three levels deep

## Anchor Links

- [Alpha Heading](#same-level-links-siblings) - Anchor to section in this file
- [File A Features](../file-a.md#features) - Anchor in child file
- [File C Deep Section](./file-c.md#the-deepest-level) - Anchor in deep file

## Test Scenarios

After initial validation, files can be moved to test that the validator catches broken links:

1. Move `alpha.md` to `level-a/alpha.md`
2. Move `level-a/file-a.md` to `level-a/level-b/file-a.md`
3. Rename `level-a/level-b/` to `level-a/renamed-b/`
