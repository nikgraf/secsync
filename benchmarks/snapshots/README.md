## Install the Benchmarks

```sh
pnpm install
```

Note: The benchmarks use the secsync version published to npm. This is to avoid any performance hits that might exist in the development version.

## Run the Benchmarks

```sh
pnpm init:data
pnpm load:automerge
pnpm load:secsync:automerge
pnpm load:yjs2
pnpm load:secsync:yjs2
```

To reduce the amount of changes used for the benchmark uncomment this line in `initData.js`:

```js
// txns = txns.slice(0, 10000);
```
