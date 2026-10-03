---
name: Python toolchain selection
description: A package-tool mismatch can select a different Python runtime than the requested module.
---

When dependency installation was attempted after requesting Python 3.12, the package tool reported Python 3.12 installed but `uv` selected Python 3.14.6; NumPy then fell back to a source build and failed. The project's existing Python 3.13 environment installed the dependencies successfully.

**Why:** A mismatched interpreter can make wheel availability and dependency builds fail unexpectedly.

**How to apply:** Before changing Python modules, verify the actual interpreter shown by `uv`. Prefer the project's configured runtime unless there is a confirmed compatibility need to switch.