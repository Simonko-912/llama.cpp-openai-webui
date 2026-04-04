# Building on Windows (quick guide)

This is a short Windows-oriented summary. For all backends (CUDA, Vulkan, etc.), see the full [build guide](docs/build.md).

## Prerequisites

- [Visual Studio 2022](https://visualstudio.microsoft.com/vs/community/) with the **Desktop development with C++** workload.
- **CMake** (installed with VS or standalone). Optional: **Ninja** (faster builds; often installed with VS CMake tools).
- Use a **Developer environment** so MSVC is on `PATH`: start **x64 Native Tools Command Prompt for VS 2022** or **Developer PowerShell for VS 2022** (search from the Start menu).

## Configure and compile (CPU, typical)

From the repository root:

```powershell
cmake -B build
cmake --build build --config Release -j $env:NUMBER_OF_PROCESSORS
```

In **cmd.exe**, use `-j %NUMBER_OF_PROCESSORS%` instead of the `-j` line above.

- With the **Visual Studio** generator, outputs are usually under `build\Release\` (for example `llama-cli.exe`, `llama-server.exe`).
- If you use **Ninja** and a single-config preset (see below), executables sit directly in that preset’s build directory (no extra `Release` folder).

### Optional: CMake preset (Ninja + MSVC)

```powershell
cmake --preset x64-windows-msvc-release
cmake --build build-x64-windows-msvc-release -j $env:NUMBER_OF_PROCESSORS
```

Other Windows presets (LLVM, Vulkan, SYCL) are listed in [CMakePresets.json](CMakePresets.json).

### Optional: NVIDIA GPU (CUDA)

Requires the [CUDA toolkit](https://developer.nvidia.com/cuda-downloads). Then:

```powershell
cmake -B build-cuda -DGGML_CUDA=ON
cmake --build build-cuda --config Release -j $env:NUMBER_OF_PROCESSORS
```

More detail: [docs/build.md — CUDA](docs/build.md#cuda).

## Embedded Web UI inside `llama-server` (important)

`llama-server` does **not** compile the Svelte app when you run CMake. It **embeds whatever is already built** under [tools/server/public/](tools/server/public/) (`index.html`, `bundle.js`, `bundle.css`, …) into the executable.

So if you change the Web UI (or pull new UI changes), you must **rebuild the frontend**, then **rebuild `llama-server`**:

```powershell
cd tools\server\webui
npm install
npm run build
cd ..\..\..
cmake --build build --config Release --target llama-server
```

Adjust paths if your CMake build directory is not `build`. If you skip `npm run build`, you keep the **old** UI bundled in the repo’s last checked-in `public/` assets (or an older build), which is why new buttons or settings may be missing.

To build the server **without** embedding the Web UI, configure with `-DLLAMA_BUILD_WEBUI=OFF`. Full pipeline: [tools/server/webui/README.md — Build Pipeline](tools/server/webui/README.md#build-pipeline).

## Run (smoke check)

You need a GGUF model (local file or Hugging Face). Examples:

```powershell
# Local file
.\build\Release\llama-cli.exe -m path\to\model.gguf -p "Hello" -n 16

# Small model from Hugging Face (downloads on first run)
.\build\Release\llama-cli.exe -hf ggml-org/gemma-3-1b-it-GGUF -p "Hello" -n 16
```

OpenAI-compatible HTTP server:

```powershell
.\build\Release\llama-server.exe -hf ggml-org/gemma-3-1b-it-GGUF
```

Then open the URL printed in the terminal (default is often `http://127.0.0.1:8080`).

## Test

By default, standalone builds enable tests (`LLAMA_BUILD_TESTS`). After a successful build:

**Visual Studio multi-config build tree (`build`):**

```powershell
cd build
ctest -C Release --output-on-failure
```

**Single-config preset tree (e.g. `build-x64-windows-msvc-release`):**

```powershell
cd build-x64-windows-msvc-release
ctest --output-on-failure
```

Some tests may download model data on first run; ensure you have network access. To skip building tests (faster iteration), configure with `-DLLAMA_BUILD_TESTS=OFF`.

## See also

- [docs/build.md](docs/build.md) — complete build options
- [README.md](README.md) — usage and features
- [tools/server/README.md](tools/server/README.md) — `llama-server` and API
